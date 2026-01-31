import * as vscode from 'vscode';
import { Section } from '../taskProvider.js'
import { getWebviewContent } from './webview_utils.js';
import { PersistentLens } from '../types/lens.js';
import { FileTreeDataProvider } from '../fileTreeDataProvider.js';

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