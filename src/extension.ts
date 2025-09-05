import * as vscode from 'vscode';
import { TaskProvider, Section } from './taskProvider'
import * as path from 'path';
import * as fs from 'fs';

let currentPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {

	const leftProvider = new TaskProvider();
  vscode.window.registerTreeDataProvider('leftView', leftProvider);

  const disposable = vscode.commands.registerCommand('sprout.lineClicked', (item: Section) => {
  
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.Two, true);
        updatePanelContent(currentPanel, item, context.extensionPath);
    } else {
        currentPanel = vscode.window.createWebviewPanel(
          'myRightPanel',
          'My Right Panel',
          { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
          { enableScripts: true }
        );

        updatePanelContent(currentPanel, item, context.extensionPath);

        currentPanel.onDidDispose(() => {
          currentPanel = undefined;
        }, null, context.subscriptions);
    }
  });

  context.subscriptions.push(disposable);
}

function getWebviewContent(extensionPath: string, item: any): string {
    const htmlPath = path.join(extensionPath, 'src', 'rightPanelWebView.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    htmlContent = htmlContent.replace('{{TITLE}}', item.label);

    const description = `Description of <strong>${item.label}</strong>.`;
    htmlContent = htmlContent.replace('{{DESCRIPTION}}', description)

    return htmlContent;
}

function updatePanelContent(panel: vscode.WebviewPanel, item: Section, extensionPath: string) {
  panel.title = `${item.label}`;
  panel.webview.html = getWebviewContent(extensionPath, item);
}

export function deactivate() {}
