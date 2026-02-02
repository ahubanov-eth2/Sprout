import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { PersistentLens, ExtensionState } from './types/types.js';

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
import { getWorkspaceRoot } from './utils/workspace_utils.js';
import { updatePanelContent } from './content_utils/panel_utils.js';

import { registerTempFileMirrorListener } from './listeners/tempFileMirrorListener.js';
import { registerPersistentLensListener } from './listeners/persistentLensListener.js';

const codeLensChangeEmitter = new vscode.EventEmitter<void>();
const hintDecorationType = vscode.window.createTextEditorDecorationType({backgroundColor: "#0078d4a0"});
const clickableHintLines = new Map<string, { lines: [number, number][], hintText: string, label: string, isTemp: boolean, persistent_lenses: PersistentLens[]}>();
const state: ExtensionState = { clickableHintLines: new Map() };
const scheme = 'sprouthint';

export function activate(context: vscode.ExtensionContext) {

  const leftProvider = new TaskProvider(context);
  const treeView = vscode.window.createTreeView('leftView', {
    treeDataProvider: leftProvider
  });

  const fileProvider = new FileTreeDataProvider();
  vscode.window.registerTreeDataProvider('clonedReposView', fileProvider);

  const projectsDirectory = path.join( getWorkspaceRoot(), 'data', 'project-repository' );
  if (fs.existsSync(projectsDirectory)) {
      fileProvider.setRepoPath(projectsDirectory);
  }

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
    registerGoToNextItemCommand(leftProvider),
    registerGoToPrevItemCommand(leftProvider),
    registerOpenFileCommand(),
    registerShowSolutionCommand(leftProvider, fileProvider, () => state.tempFileCopyUri, () => state.activeFileUri),
    registerShowHintPopupCommand(leftProvider, () => state.currentPanel),
    hintDecorationType,
    registerShowInlineHintFromLensCommand(clickableHintLines),
    codeLensProviderDisposable,
    registerToggleHighlightCommand(leftProvider, () => state.tempFileCopyUri),
    registerLineClickedCommand(
      context, leftProvider, fileProvider, treeView, clickableHintLines, codeLensChangeEmitter, state, updatePanelContent
    ),
    registerGoToItemByIndexCommand(leftProvider),
    vscode.workspace.registerTextDocumentContentProvider(scheme, inlineHintContentProvider),
    registerTempFileMirrorListener(() => state.tempFileCopyUri),
    registerPersistentLensListener(clickableHintLines, codeLensChangeEmitter, context, leftProvider, fileProvider, () => state.currentItem, () => state.currentPanel),
    hintSchema
  );
}

export function deactivate() {}