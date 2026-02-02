import * as vscode from 'vscode';

import { ExtensionState } from '../../types/types.js';
import { TaskProvider, Section } from '../../taskProvider.js';
import { FileTreeDataProvider } from '../../fileTreeDataProvider.js';

import { registerGoToItemByIndexCommand }        from '../goToItemByIndex.js';
import { registerGoToNextItemCommand }           from '../goToNextItem.js';
import { registerGoToPrevItemCommand }           from '../goToPreviousItem.js';
import { registerOpenFileCommand }               from '../openFile.js';
import { registerShowHintPopupCommand }          from '../showHintPopup.js';
import { registerShowInlineHintFromLensCommand } from '../showInlineHintFromLens.js';
import { registerToggleHighlightCommand }        from '../toggleHighlight.js';
import { registerShowSolutionCommand }           from '../showSolution.js';
import { registerLineClickedCommand }            from '../lineClicked.js';

import { updatePanelContent } from '../../content_utils/panel_utils.js';

export function registerCommands(
  context: vscode.ExtensionContext,
  views: { 
    contentProvider: TaskProvider, 
    contentTreeViewDisposable: vscode.TreeView<Section | vscode.TreeItem>, 
    codeFileProvider: FileTreeDataProvider },
  state: ExtensionState
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
    registerShowInlineHintFromLensCommand(state.clickableHintLines),
    registerShowHintPopupCommand(contentProvider, () => state.currentPanel),
    registerShowSolutionCommand(contentProvider, codeFileProvider, () => state.tempFileCopyUri, () => state.activeFileUri),
    registerToggleHighlightCommand(contentProvider, () => state.tempFileCopyUri),

    //
    registerLineClickedCommand(
      context, contentProvider, codeFileProvider, contentTreeViewDisposable, state, updatePanelContent
    )
  );
}