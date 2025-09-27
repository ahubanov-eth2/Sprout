import * as vscode from 'vscode';
import { TaskProvider, Section } from './taskProvider.js'
import { FileTreeDataProvider } from './fileTreeDataProvider.js';
import * as path from 'path';
import * as fs from 'fs';
import { marked } from 'marked';
import { exec } from 'child_process';
import * as os from 'os';

let currentPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {

	const leftProvider = new TaskProvider(context);
  vscode.window.registerTreeDataProvider('leftView', leftProvider);

  const fileProvider = new FileTreeDataProvider();
  vscode.window.registerTreeDataProvider('clonedReposView', fileProvider);

  const destinationPath = path.join(os.homedir(), 'test-clone');
  if (fs.existsSync(destinationPath)) {
      fileProvider.setRepoPath(destinationPath);
  }

  const disposable = vscode.commands.registerCommand('sprout.lineClicked', async (item: Section) => {
    
    const { siblings, currentIndex } = leftProvider.getLeafSiblings(item);
    const parent = leftProvider.findParent(leftProvider.getRoot(), item);
    const parentLabel = (parent !== undefined) ? parent.label : ""

    let isFileOpen = false;

    if (item.fileToOpen) {
      const clonedRepoPath = fileProvider.getRepoPath();
      if (clonedRepoPath) {
          const fileUri = vscode.Uri.file(path.join(clonedRepoPath, item.fileToOpen));
          try {
              const doc = await vscode.workspace.openTextDocument(fileUri);
              await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
              isFileOpen = true;
          } catch (error) {
              vscode.window.showErrorMessage(`Could not open file: ${item.fileToOpen}`);
          }
      } else {
          vscode.window.showWarningMessage('No cloned repository found to open the file.');
      }
    } else {
        if (vscode.window.tabGroups.all.length > 1) {
            await vscode.commands.executeCommand('workbench.action.closeOtherEditors');
        }
    }

    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.One, true);
    } else {
        currentPanel = vscode.window.createWebviewPanel(
          'myRightPanel',
          'My Right Panel',
          { viewColumn: vscode.ViewColumn.One, preserveFocus: true },
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
                    case 'cloneProject':
                        vscode.commands.executeCommand('sprout.cloneProject', message.label, message.repoName);
                        break;
                }
            },
            undefined,
            context.subscriptions
        );

        currentPanel.onDidDispose(() => {
          currentPanel = undefined;
        }, null, context.subscriptions);
    }

    if (isFileOpen && currentPanel) {
      await vscode.commands.executeCommand('workbench.action.splitEditorToBelowGroup');
    }

    if (currentPanel) {
        updatePanelContent(currentPanel, item, context, siblings, currentIndex, parentLabel);
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

    const cloneProjectDisposable = vscode.commands.registerCommand('sprout.cloneProject', (label: string, repoName: string) => {
        const currentItem = leftProvider.findLeafByLabel(label);
        if (currentItem && currentItem.shellConfigPath) {
            try {
                const destination = path.join(os.homedir(), 'test-clone');

                if (fs.existsSync(destination)) {
                    vscode.window.showInformationMessage('Project already cloned.');
                    fileProvider.setRepoPath(destination);
                    return;
                }

                exec(`"${process.execPath}" "${currentItem.shellConfigPath}"`, (error, stdout, stderr) => {
                    console.log(`stdout: ${stdout}`);
                    console.error(`stderr: ${stderr}`);

                    if (error) {
                        vscode.window.showErrorMessage(`Script failed with error: ${error.message}`);
                        return;
                    }

                    vscode.window.showInformationMessage('Project cloned successfully.');
                    
                    fileProvider.setRepoPath(destination);
                });
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to start command execution: ${error.message}`);
            }
        }
    });

  const openFileDisposable = vscode.commands.registerCommand('sprout.openFile', (uri: vscode.Uri) => {
        vscode.window.showTextDocument(uri);
    })

  context.subscriptions.push(nextItemDisposable, prevItemDisposable, cloneProjectDisposable, openFileDisposable);
}

function getWebviewContent(
  extensionPath: string, 
  item: any, 
  siblings: Section[], 
  currentIndex: number,
  parentLabel: string
): string 
{
    const htmlPath = path.join(extensionPath, 'src', 'rightPanelWebView.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    htmlContent = htmlContent.replace('{{PARENT_TITLE}}', parentLabel);

    let paginationHtml = '';
    if (siblings.length > 0) {
        paginationHtml = `<div class="pagination-container">`;
        for (let i = 0; i < siblings.length; i++) {
            const className = i === currentIndex ? 'step-box active' : 'step-box';
            paginationHtml += `<div class="${className}">${i + 1}</div>`;
        }
        paginationHtml += `</div>`;
    }

    htmlContent = htmlContent.replace('{{PAGINATION}}', paginationHtml);
    htmlContent = htmlContent.replace('{{TITLE}}', item.label);

    let description = '';
    if (item.filePath)
    {
      const markdownPath = item.filePath;
      try {
          const markdownContent = fs.readFileSync(markdownPath, 'utf8');
          description = marked.parse(markdownContent) as string;
      } catch (error) {
          description = `Failed to load content for ${item.label}.`;
          console.error(error);
      } 
    }
    else
    {
      description = `Description of <strong>${item.label}</strong>.`;
    }

    let cloneButtonHtml = '';
    if (item.shellConfigPath) {
        cloneButtonHtml = `
            <button id="cloneButton" data-repo-name="${item.repoName}">
                Clone Project
            </button>
        `;
    }

    htmlContent = htmlContent.replace('{{DESCRIPTION}}', description);
    htmlContent = htmlContent.replace('{{CLONE_BUTTON}}', cloneButtonHtml);
    htmlContent = htmlContent.replace('{{LABEL}}', item.label);

    return htmlContent;
}

function updatePanelContent(
  panel: vscode.WebviewPanel, 
  item: Section, 
  extensionContext: 
  vscode.ExtensionContext, 
  siblings: Section[], 
  currentIndex: number,
  parentLabel: string
) {
  panel.title = `${item.label}`;
  panel.webview.html = getWebviewContent(extensionContext.extensionPath, item, siblings, currentIndex, parentLabel); 
}

export function deactivate() {}
