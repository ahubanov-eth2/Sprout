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
      <head>
        <style>
          body {
            font-family: inter;
            padding: 1em;
            font-size: 24px;
          }

          .dropdown {
            margin-bottom: 0.5em;
          }

          .dropdown-header {
            cursor: pointer;
            font-size: 1.2rem;
            font-weight: 500;
            color: grey;
            display: flex;
            align-items: center;
            user-select: none;
          }

          .dropdown-header::before {
            content: "▶";
            display: inline-block;
            margin-right: 1em;
            color: grey;
            transition: transform 0.3s ease;
          }

          .dropdown.open > .dropdown-header::before {
            transform: rotate(90deg);
          }

          .dropdown-content {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.5s ease;
            color: grey;
            font-size: 1rem;
            padding-left: 2em; 
          }
        </style>
      </head>
      <body style="font-family: sans-serif; padding: 1em;">
        <h2>${item.label}</h2>
        <p>Description of ${item.label}</p>

        <div class="dropdown">
          <div class="dropdown-header">Step 1</div>
          <div class="dropdown-content">
            <p>This is what you need to do to complete step 1.</p>

            <div class="dropdown">
              <div class="dropdown-header">Hint</div>
              <div class="dropdown-content">
                <p>This is a hint for completing step 1.</p>
              </div>
            </div>
          </div>
        </div>

        <div class="dropdown">
          <div class="dropdown-header">Step 2</div>
          <div class="dropdown-content">
            <p>This is what you need to do to complete step 2.</p>

            <div class="dropdown">
              <div class="dropdown-header">Hint</div>
              <div class="dropdown-content">
                <p>This is a hint for completing step 2.</p>
              </div>
            </div>
          </div>
        </div>

        <div class="dropdown">
          <div class="dropdown-header">Step 3</div>
          <div class="dropdown-content">
            <p>This is what you need to do to complete step 3.</p>

            <div class="dropdown">
              <div class="dropdown-header">Hint</div>
              <div class="dropdown-content">
                <p>This is a hint for completing step 3.</p>
              </div>
            </div>
          </div>
        </div>

        <script>
          document.querySelectorAll('.dropdown-header').forEach(header => {
            header.addEventListener('click', () => {
              const drop = header.parentElement;
              const content = drop.querySelector('.dropdown-content');

              if (drop.classList.contains('open')) {
                content.style.maxHeight = content.scrollHeight + "px"; // set to current
                requestAnimationFrame(() => {
                  content.style.maxHeight = "0px";
                });
                drop.classList.remove('open');
              } else {
                drop.classList.add('open');
                content.style.maxHeight = content.scrollHeight + "px";
                content.addEventListener('transitionend', function clear() {
                  if (drop.classList.contains('open')) {
                    content.style.maxHeight = "none";
                  }
                  content.removeEventListener('transitionend', clear);
                });
              }
            });
          });
        </script>

      </body>
    </html>
  `;
}

// This method is called when your extension is deactivated
export function deactivate() {}
