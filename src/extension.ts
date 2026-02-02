import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { PersistentLens, ExtensionState } from './types/types.js';

import { TaskProvider, Section } from './taskProvider.js'
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
const clickableHintLines = new Map<string, { lines: [number, number][], hintText: string, label: string, isTemp: boolean, persistent_lenses: PersistentLens[]}>();
const state: ExtensionState = { clickableHintLines: new Map() };
const scheme = 'sprouthint';

export function activate(context: vscode.ExtensionContext) {

  const views = registerViews(context);
  registerCodeLensProviderDisposable(context, clickableHintLines);
  registerCommands(context, views);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(scheme, inlineHintContentProvider),
    registerTempFileMirrorListener(() => state.tempFileCopyUri),
    registerPersistentLensListener(clickableHintLines, codeLensChangeEmitter, context, contentProvider, codeFileProvider, () => state.currentItem, () => state.currentPanel),
  );
}

export function deactivate() {}

function registerViews(context: vscode.ExtensionContext) {

  //
  const contentProvider = new TaskProvider(context);
  const contentTreeViewDisposable = vscode.window.createTreeView('leftView', { treeDataProvider: contentProvider });

  context.subscriptions.push(contentTreeViewDisposable);

  //
  const codeFileProvider = new FileTreeDataProvider();
  const fileTreeDisposable = vscode.window.registerTreeDataProvider('clonedReposView', codeFileProvider);

  context.subscriptions.push(fileTreeDisposable);

  //
  const projectsDirectory = path.join( getWorkspaceRoot(), 'data', 'project-repository' );
  if (fs.existsSync(projectsDirectory)) {
      codeFileProvider.setRepoPath(projectsDirectory);
  }

  return { contentProvider, contentTreeViewDisposable, codeFileProvider };
}

function registerCodeLensProviderDisposable(
  context: vscode.ExtensionContext,
  clickableHintLines: Map<string, { lines: [number, number][], hintText: string, label: string, isTemp: boolean, persistent_lenses: PersistentLens[]}>
) {

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

  context.subscriptions.push(codeLensProviderDisposable);

}

function registerCommands(
  context: vscode.ExtensionContext,
  views: { 
    contentProvider: TaskProvider, 
    contentTreeViewDisposable: vscode.TreeView<Section | vscode.TreeItem>, 
    codeFileProvider: FileTreeDataProvider }
) {

  const contentProvider = views.contentProvider;
  const contentTreeViewDisposable = views.contentTreeViewDisposable;
  const codeFileProvider = views.codeFileProvider;

  context.subscriptions.push(

    //
    registerGoToNextItemCommand(contentProvider),
    registerGoToPrevItemCommand(contentProvider),
    registerGoToItemByIndexCommand(contentProvider),

    //
    registerOpenFileCommand(),

    //
    registerShowInlineHintFromLensCommand(clickableHintLines),
    registerShowHintPopupCommand(contentProvider, () => state.currentPanel),
    registerShowSolutionCommand(contentProvider, codeFileProvider, () => state.tempFileCopyUri, () => state.activeFileUri),
    registerToggleHighlightCommand(contentProvider, () => state.tempFileCopyUri),

    //
    registerLineClickedCommand(
      context, contentProvider, codeFileProvider, contentTreeViewDisposable, clickableHintLines, codeLensChangeEmitter, state, updatePanelContent
    )
  );
}