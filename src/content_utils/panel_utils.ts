import * as vscode from 'vscode';
import { Section } from '../taskProvider.js'
import { getWebviewContent } from './webview_utils.js';
import { PersistentLens } from '../types/lens.js';
import { FileTreeDataProvider } from '../fileTreeDataProvider.js';
import { ExtensionState } from '../extension.js';

export function createWebviewPanel(
  context: vscode.ExtensionContext,
  viewColumn: vscode.ViewColumn,
  useMediaFolder: boolean = false
): vscode.WebviewPanel {

  const localResourceRoots = useMediaFolder ? [vscode.Uri.joinPath(context.extensionUri, 'media')] : undefined;
  const panel =
    vscode.window.createWebviewPanel(
      'myRightPanel',
      'My Right Panel',
      { viewColumn, preserveFocus: true },
      { enableScripts: true, enableFindWidget: true, localResourceRoots }
    );

  return panel;
}

export function updatePanelContent(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel, 
  item: Section, 
  siblings: Section[], 
  currentIndex: number,
  parentLabel: string,
  fileProvider: FileTreeDataProvider,
  clickableHintLines: Map<string, { lines: [number, number][], hintText: string, label: string, isTemp: boolean, persistent_lenses: PersistentLens[]}>
) {

  const checklistState =
  context.workspaceState.get<Record<string, boolean>>(
    `sprout:checklist:${item.label}`,
    {}
  );

  panel.title = `${item.label}`;
  panel.webview.html = getWebviewContent(item, siblings, currentIndex, parentLabel, panel.webview, fileProvider, clickableHintLines, checklistState); 
}

export function registerWebviewMessageHandlers(
  context: vscode.ExtensionContext,
  state: ExtensionState,
  clickableHintLines: Map<string, { lines: [number, number][], hintText: string, label: string, isTemp: boolean, persistent_lenses: PersistentLens[]}>
) {
    state.currentPanel?.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case 'goToIndex': 
            vscode.commands.executeCommand('sprout.goToItemByIndex', message.label, message.index);
            break;
          case 'nextItem':
            vscode.commands.executeCommand('sprout.goToNextItem',message.label);
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
          case 'prevItem':
            vscode.commands.executeCommand('sprout.goToPrevItem',message.label);
            break;
          case 'showSolution':
            vscode.commands.executeCommand('sprout.showSolution',message.label);
            break;
          case 'getHintText':
            vscode.commands.executeCommand('sprout.showHintPopup',message.label);
            break;
          case 'toggleHighlight':
            vscode.commands.executeCommand('sprout.toggleHighlight',message.label);
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

      state.currentPanel?.onDidDispose(() => {
        state.currentPanel = undefined;
      }, null, context.subscriptions);
};