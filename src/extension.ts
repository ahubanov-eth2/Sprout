import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { TaskProvider } from './taskProvider.js'
import { FileTreeDataProvider } from './fileTreeDataProvider.js';

import { registerGoToItemByIndexCommand } from './commands/goToItemByIndex.js';
import { registerGoToNextItemCommand } from './commands/goToNextItem.js';
import { registerGoToPrevItemCommand } from './commands/goToPreviousItem.js';
import { registerOpenFileCommand } from './commands/openFile.js';
import { registerShowHintPopupCommand } from './commands/showHintPopup.js';
import { registerShowInlineHintFromLensCommand } from './commands/showInlineHintFromLens.js';
import { registerToggleHighlightCommand } from './commands/toggleHighlight.js';
import { registerShowSolutionCommand } from './commands/showSolution.js';
import { registerLineClickedCommand } from './commands/lineClicked.js';
import { inlineHintContentProvider } from './hints/inlineHintUtils.js';
import { PersistentLens } from './types/lens.js';
import { getWorkspaceRoot } from './utils/workspace_utils.js';
import { updatePanelContent } from './content_utils/panel_utils.js';

import { registerTempFileMirrorListener } from './listeners/tempFileMirrorListener.js';
import { registerPersistentLensListener } from './listeners/persistentLensListener.js';

const codeLensChangeEmitter = new vscode.EventEmitter<void>();
const hintDecorationType = vscode.window.createTextEditorDecorationType({backgroundColor: "#0078d4a0"});
const clickableHintLines = new Map<string, { lines: [number, number][], hintText: string, label: string, isTemp: boolean, persistent_lenses: PersistentLens[]}>();
const scheme = 'sprouthint';

type ChecklistState = Record<string, boolean>;

export type ExtensionState = {
  currentPanel?: vscode.WebviewPanel;
  activeFileUri?: vscode.Uri;
  tempFileCopyUri?: vscode.Uri;
  clickableHintLines: Map<string, { lines: [number, number][], hintText: string, label: string, isTemp: boolean, persistent_lenses: PersistentLens[]}>;
};

const state: ExtensionState = {
  clickableHintLines: new Map()
};

export function activate(context: vscode.ExtensionContext) {

  const leftProvider = new TaskProvider(context);
  const treeView = vscode.window.createTreeView('leftView', {
    treeDataProvider: leftProvider
  });

  const fileProvider = new FileTreeDataProvider();
  vscode.window.registerTreeDataProvider('clonedReposView', fileProvider);

  const projectsDirectory = path.join(
    getWorkspaceRoot(),
    'data',
    'project-repository'
  );

  if (fs.existsSync(projectsDirectory)) {
      fileProvider.setRepoPath(projectsDirectory);
  }

  function revealPanel(){
    if (state.currentPanel) {
        state.currentPanel.reveal(vscode.ViewColumn.One, true);
    } else {
        const extensionMediaUri = vscode.Uri.joinPath(context.extensionUri, 'media');
        state.currentPanel = vscode.window.createWebviewPanel(
          'myRightPanel',
          'My Right Panel',
          { viewColumn: vscode.ViewColumn.One, preserveFocus: true },
          { enableScripts: true, enableFindWidget: true, localResourceRoots: [extensionMediaUri] }
        );

        state.currentPanel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'goToIndex': 
                        vscode.commands.executeCommand('sprout.goToItemByIndex', message.label, message.index);
                        break;
                    case 'scrollToLine':
                        const lensId = message.line;
                        if (!state.activeFileUri) return;
        
                        const hintInfo = clickableHintLines.get(state.activeFileUri.toString());
                        if (!hintInfo) return;
        
                        const lens = hintInfo.persistent_lenses.find(l => l.id === lensId);
                        if (!lens) return;
        
                        const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === state.activeFileUri?.toString());
                        if (editor) {
                            const range = new vscode.Range(lens.line - 1, 0, lens.line - 1, 0);
                            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                            editor.selection = new vscode.Selection(range.start, range.end);
                        }
                        break;
                    case 'nextItem':
                        vscode.commands.executeCommand('sprout.goToNextItem', message.label);
                        break; 
                    case 'prevItem':
                        vscode.commands.executeCommand('sprout.goToPrevItem', message.label);
                        break;
                    case 'showSolution':
                        vscode.commands.executeCommand('sprout.showSolution', message.label);
                        break;
                    case 'getHintText':
                        vscode.commands.executeCommand('sprout.showHintPopup', message.label);
                        break;
                    case 'toggleHighlight':
                        vscode.commands.executeCommand('sprout.toggleHighlight', message.label);
                        break;
                    case 'saveChecklistState':
                        context.workspaceState.update(
                            `sprout:checklist:${message.label}`,
                            message.state
                        );
                        break;  
                }
            },
            undefined,
            context.subscriptions
        );

        state.currentPanel.onDidDispose(() => {
          state.currentPanel = undefined;
        }, null, context.subscriptions);
    }
  }

  const findPageByIndexDisposable = registerGoToItemByIndexCommand(leftProvider);
  const toggleHighlightDisposable = registerToggleHighlightCommand(leftProvider, () => state.tempFileCopyUri);
  const nextItemDisposable = registerGoToNextItemCommand(leftProvider);
  const prevItemDisposable = registerGoToPrevItemCommand(leftProvider);
  const showSolutionDisposable = registerShowSolutionCommand(leftProvider, fileProvider, () => state.tempFileCopyUri, () => state.activeFileUri);
  const openFileDisposable = registerOpenFileCommand();
  const showHintPopupDisposable = registerShowHintPopupCommand(leftProvider, () => state.currentPanel);
  const showInlineHintFromLensDisposable = registerShowInlineHintFromLensCommand(clickableHintLines);
  const sectionSelectedDisposable = registerLineClickedCommand(
    context, leftProvider, fileProvider, treeView, clickableHintLines, codeLensChangeEmitter, state,
    () => state.tempFileCopyUri, uri => state.tempFileCopyUri = uri, uri => state.activeFileUri = uri, () => state.currentPanel, panel => state.currentPanel = panel,
    updatePanelContent, revealPanel
  );

  const codeLensProviderDisposable = vscode.languages.registerCodeLensProvider({ pattern: '**/*' }, {
    provideCodeLenses(document) {
      const hintInfo = clickableHintLines.get(document.uri.toString());
      const lenses: vscode.CodeLens[] = [];

      if (!hintInfo) return lenses;

      if (hintInfo.persistent_lenses) {
        for (const pl of hintInfo.persistent_lenses) {

          const lensArg = { line: Number(pl.line), explanation: String(pl.explanation) };
          const range = new vscode.Range(lensArg.line - 1, 0, lensArg.line - 1, 0);

          lenses.push(
            new vscode.CodeLens(range, {
              title: "💬 Learn more",
              command: 'sprout.showInlineHintFromLens',
              arguments: [document.uri, lensArg]
            })
          );
        }
      }

      return lenses;
    },
    onDidChangeCodeLenses: codeLensChangeEmitter.event
  });

  const hintSchema = vscode.workspace.registerTextDocumentContentProvider('sprout-hint', {
      provideTextDocumentContent(uri) {
          return decodeURIComponent(uri.query);
      }
  });

  context.subscriptions.push(
    nextItemDisposable, 
    prevItemDisposable, 
    openFileDisposable, 
    showSolutionDisposable,
    showHintPopupDisposable, 
    hintDecorationType,
    showInlineHintFromLensDisposable,
    codeLensProviderDisposable,
    toggleHighlightDisposable,
    sectionSelectedDisposable,
    findPageByIndexDisposable,
    vscode.workspace.registerTextDocumentContentProvider(scheme, inlineHintContentProvider),
    registerTempFileMirrorListener(() => state.tempFileCopyUri),
    registerPersistentLensListener(clickableHintLines, codeLensChangeEmitter, context),
    hintSchema
  );
}

export function deactivate() {}

function makeHover(explanation: string, uri: vscode.Uri, line: number) {
  const md = new vscode.MarkdownString(
    `**Why make this change?**\n\n` +
    `${explanation}`
  );

  md.isTrusted = true;
  return md;
}

const diffHintDecoration = vscode.window.createTextEditorDecorationType({
  before: {
    contentText: '💡',
    margin: '0 0 0 0rem'
  },
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
});

export function decorateDiffEditor(
  editor: vscode.TextEditor,
  hints: { line: number; explanation: string }[]
) {
  const decorations: vscode.DecorationOptions[] = hints.map(hint => {
    const line = editor.document.lineAt(hint.line);

    return {
      range: new vscode.Range(hint.line, 0, hint.line, line.text.length),
      hoverMessage: makeHover(hint.explanation, editor.document.uri, hint.line)
    };
  });

  editor.setDecorations(diffHintDecoration, decorations);
}

