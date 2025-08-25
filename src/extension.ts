import * as vscode from 'vscode';
import { LineProvider, LineItem } from './lineProvider'

let currentPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {

	const leftProvider = new LineProvider();
  vscode.window.registerTreeDataProvider('leftView', leftProvider);

  const disposable = vscode.commands.registerCommand('sprout.lineClicked', (item: LineItem) => {
    // vscode.window.showInformationMessage(`You clicked: ${item.label}`);
  
    if (currentPanel) {
        // Panel already exists: just reveal it and update HTML
        currentPanel.reveal(vscode.ViewColumn.Two, true);
        updatePanelContent(currentPanel, item);
    } else {
        currentPanel = vscode.window.createWebviewPanel(
          'myRightPanel',
          'My Right Panel',
          { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
          { enableScripts: true }
        );

        updatePanelContent(currentPanel, item);

        // Reset when user closes the panel
        currentPanel.onDidDispose(() => {
          currentPanel = undefined;
        }, null, context.subscriptions);
    }
  });

  context.subscriptions.push(disposable);
}

function updatePanelContent(panel: vscode.WebviewPanel, item: LineItem) {
  panel.title = `${item.label}`;
  panel.webview.html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: sans-serif; padding: 1em;">
        <h2>${item.label}</h2>
        <p>Description of ${item.label}</p>

        <details>
          <summary>Step 1</summary>
          <p>This is what you need to do to complete step 1.</p>
        </details>

        <details>
          <summary>Step 2</summary>
          <p>This is what you need to do to complete step 2.</p>
        </details>

        <details>
          <summary>Step 3</summary>
          <p>This is what you need to do to complete step 3.</p>
        </details>

      </body>
    </html>
  `;
}

// This method is called when your extension is deactivated
export function deactivate() {}
