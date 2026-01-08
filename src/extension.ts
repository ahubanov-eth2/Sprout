import * as vscode from 'vscode';
import { TaskProvider } from './taskProvider.js'
import { FileTreeDataProvider } from './fileTreeDataProvider.js';
import * as path from 'path';
import * as fs from 'fs';

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

const codeLensChangeEmitter = new vscode.EventEmitter<void>();

let currentPanel: vscode.WebviewPanel | undefined;
let onDidEndTaskDisposable: vscode.Disposable | undefined;
let activeFileUri: vscode.Uri | undefined;
let tempFileCopyUri: vscode.Uri | undefined;

const hintDecorationType = vscode.window.createTextEditorDecorationType({backgroundColor: "#0078d4a0"});
const clickableHintLines = new Map<string, { lines: [number, number][], hintText: string, label: string, isTemp: boolean, persistent_lenses: PersistentLens[]}>();
const scheme = 'sprouthint';

export function activate(context: vscode.ExtensionContext) {
  const projectsDirectory = path.join(
    getWorkspaceRoot(),
    'data',
    'project-repository'
  );

  const leftProvider = new TaskProvider(context);
  const treeView = vscode.window.createTreeView('leftView', {
    treeDataProvider: leftProvider
  });

  const fileProvider = new FileTreeDataProvider();
  vscode.window.registerTreeDataProvider('clonedReposView', fileProvider);

  if (fs.existsSync(projectsDirectory)) {
      fileProvider.setRepoPath(projectsDirectory);
  }

  const listener = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor) return;

      if (editor.document.fileName.endsWith('data/project-repository/dev-test/index.html')) {

          await new Promise(r => setTimeout(r, 1000));

          try {
              await vscode.commands.executeCommand('extension.liveServer.goOnline');
              vscode.window.showInformationMessage('Sprout: Decap CMS launched on Live Server 🚀');
          } catch (err) {
              console.error('Failed to launch Live Server:', err);
          }
      }
  });
  context.subscriptions.push(listener);

  vscode.workspace.onDidChangeTextDocument(event => {
      if (tempFileCopyUri && event.document.uri.toString() === tempFileCopyUri.toString()) {
          const edit = new vscode.WorkspaceEdit();

          edit.replace(
              event.document.uri,
              new vscode.Range(0, 0, event.document.lineCount, 0),
              event.document.getText()
          );
          vscode.workspace.applyEdit(edit);
      }
  });

  vscode.workspace.onDidChangeTextDocument(event => {
      const uri = event.document.uri.toString();
      const hintInfo = clickableHintLines.get(uri);

      if (!hintInfo || !hintInfo.persistent_lenses) return;

      event.contentChanges.forEach(change => {
          const startLine = change.range.start.line + 1;
          const endLine = change.range.end.line + 1;

          hintInfo.persistent_lenses = hintInfo.persistent_lenses.filter(lens => {
              const line = Number(lens.line);
              const isWithinDeletedRange = line >= startLine && line <= endLine;
              
              return !isWithinDeletedRange;
          });
          
          const linesAdded = change.text.split('\n').length - 1;
          const linesRemoved = endLine - startLine;
          const lineDelta = linesAdded - linesRemoved;

          if (lineDelta !== 0) {
            hintInfo.persistent_lenses = hintInfo.persistent_lenses.map(lens => {
                const currentLine = Number(lens.line);
                if (currentLine > startLine) {
                    return { ...lens, line: currentLine + lineDelta };
                }

                return lens;
            });
          }
      });

      codeLensChangeEmitter.fire();
  });

  function revealPanel(){
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.One, true);
    } else {
        const extensionMediaUri = vscode.Uri.joinPath(context.extensionUri, 'media');
        currentPanel = vscode.window.createWebviewPanel(
          'myRightPanel',
          'My Right Panel',
          { viewColumn: vscode.ViewColumn.One, preserveFocus: true },
          { enableScripts: true, enableFindWidget: true, localResourceRoots: [extensionMediaUri] }
        );

        currentPanel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
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
                }
            },
            undefined,
            context.subscriptions
        );

        currentPanel.onDidDispose(() => {
          currentPanel = undefined;
        }, null, context.subscriptions);
    }
  }

  const toggleHighlightDisposable = registerToggleHighlightCommand(leftProvider, () => tempFileCopyUri);
  const sectionSelectedDisposable = registerLineClickedCommand(
    context, leftProvider, fileProvider, treeView,
    clickableHintLines, codeLensChangeEmitter,
    () => tempFileCopyUri,
    uri => tempFileCopyUri = uri,
    uri => activeFileUri = uri,
    () => currentPanel,
    panel => currentPanel = panel,
    updatePanelContent,
    revealPanel
  );

  const nextItemDisposable = registerGoToNextItemCommand(leftProvider);
  const prevItemDisposable = registerGoToPrevItemCommand(leftProvider);
  const showSolutionDisposable = registerShowSolutionCommand(leftProvider, fileProvider, () => tempFileCopyUri, () => activeFileUri);
  const openFileDisposable = registerOpenFileCommand();
  const showHintPopupDisposable = registerShowHintPopupCommand(leftProvider, () => currentPanel);
  const showInlineHintFromLensDisposable = registerShowInlineHintFromLensCommand(clickableHintLines);

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
    vscode.workspace.registerTextDocumentContentProvider(scheme, inlineHintContentProvider),
    hintSchema
  );
}

export function deactivate() {}
