import * as vscode from 'vscode';

import { TaskProvider, Section } from '../../taskProvider.js';
import { FileTreeDataProvider } from '../../fileTreeDataProvider.js';

import { registerTempFileMirrorListener } from '../tempFileMirrorListener.js';
import { registerPersistentLensListener } from '../persistentLensListener.js';

export function registerEventListeners(
  context: vscode.ExtensionContext,
  views: { 
    contentProvider: TaskProvider, 
    contentTreeViewDisposable: vscode.TreeView<Section | vscode.TreeItem>, 
    codeFileProvider: FileTreeDataProvider }
) {

  const contentProvider = views.contentProvider;
  const codeFileProvider = views.codeFileProvider;

  context.subscriptions.push(
    registerTempFileMirrorListener(() => state.tempFileCopyUri),
    registerPersistentLensListener(clickableHintLines, codeLensChangeEmitter, context, contentProvider, codeFileProvider, () => state.currentItem, () => state.currentPanel)
  );

}