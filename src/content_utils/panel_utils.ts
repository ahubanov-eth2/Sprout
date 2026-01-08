import * as vscode from 'vscode';
import { Section } from '../taskProvider.js'
import { getWebviewContent } from './webview_utils.js';

export function updatePanelContent(
  panel: vscode.WebviewPanel, 
  item: Section, 
  siblings: Section[], 
  currentIndex: number,
  parentLabel: string,
) {
  panel.title = `${item.label}`;
  panel.webview.html = getWebviewContent(item, siblings, currentIndex, parentLabel, panel.webview); 
}