import * as vscode from 'vscode';

import { ExtensionState } from '../../types/types.js';
import { TaskProvider, Section } from '../../providers/taskProvider.js';
import { FileTreeDataProvider } from '../../providers/fileTreeDataProvider.js';

import { registerTempFileMirrorListener } from '../tempFileMirrorListener.js';
import { registerPersistentLensListener } from '../persistentLensListener.js';

export function registerEventListeners(
  context: vscode.ExtensionContext,
  views: { 
    contentProvider: TaskProvider, 
    contentTreeViewDisposable: vscode.TreeView<Section | vscode.TreeItem>, 
    codeFileProvider: FileTreeDataProvider },
  state: ExtensionState
) {

  const contentProvider = views.contentProvider;
  const codeFileProvider = views.codeFileProvider;

  const clickableHintLines = state.clickableHintLines;
  const codeLensChangeEmitter = state.codeLensChangeEmitter;

  context.subscriptions.push(
    registerTempFileMirrorListener(() => state.tempFileCopyUri),
    registerPersistentLensListener(
        clickableHintLines, 
        codeLensChangeEmitter, 
        context,
        state, 
        contentProvider, 
        codeFileProvider)
  );

}