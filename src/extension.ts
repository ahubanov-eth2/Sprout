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
        updatePanelContent(currentPanel, item, context);
    } else {
        currentPanel = vscode.window.createWebviewPanel(
          'myRightPanel',
          'My Right Panel',
          { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
          { enableScripts: true }
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
                }
            },
            undefined,
            context.subscriptions
        );
        
        updatePanelContent(currentPanel, item, context);

        currentPanel.onDidDispose(() => {
          currentPanel = undefined;
        }, null, context.subscriptions);
    }
  });
  context.subscriptions.push(disposable);

  const nextItemDisposable = vscode.commands.registerCommand('sprout.goToNextItem', (label: string) => {
    const currentItem = leftProvider.findLeafByLabel(label);
    if (currentItem) {
      const nextItem = leftProvider.findNextLeaf(currentItem);
      if (nextItem) {
        vscode.commands.executeCommand('sprout.lineClicked', nextItem);
      } else {
        vscode.window.showInformationMessage('You are at the end of the list.');
      }
    }
  });

  const prevItemDisposable = vscode.commands.registerCommand('sprout.goToPrevItem', (label: string) => {
    const currentItem = leftProvider.findLeafByLabel(label);
    if (currentItem) {
      const prevItem = leftProvider.findPrevLeaf(currentItem);
      if (prevItem) {
        vscode.commands.executeCommand('sprout.lineClicked', prevItem);
      } else {
        vscode.window.showInformationMessage('You are at the start of the list.');
      }
    }
  });

  context.subscriptions.push(nextItemDisposable, prevItemDisposable);
}

function getWebviewContent(extensionPath: string, item: any): string {
    const htmlPath = path.join(extensionPath, 'src', 'rightPanelWebView.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    htmlContent = htmlContent.replace('{{TITLE}}', item.label);

    const description = `Description of <strong>${item.label}</strong>.`;
    htmlContent = htmlContent.replace('{{DESCRIPTION}}', description);
    htmlContent = htmlContent.replace('{{LABEL}}', item.label);

    return htmlContent;
}

function updatePanelContent(panel: vscode.WebviewPanel, item: Section, extensionContext: vscode.ExtensionContext) {
  panel.title = `${item.label}`;
  panel.webview.html = getWebviewContent(extensionContext.extensionPath, item); 
}

export function deactivate() {}
