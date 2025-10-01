import * as vscode from 'vscode';
import { TaskProvider, Section } from './taskProvider.js'
import { FileTreeDataProvider } from './fileTreeDataProvider.js';
import * as path from 'path';
import * as fs from 'fs';
import { marked } from 'marked';
import * as os from 'os';

let currentPanel: vscode.WebviewPanel | undefined;
let onDidEndTaskDisposable: vscode.Disposable | undefined;
let activeFileUri: vscode.Uri | undefined;

const hintDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: "#0078d4a0"
});

export function activate(context: vscode.ExtensionContext) {

	const leftProvider = new TaskProvider(context);
  vscode.window.registerTreeDataProvider('leftView', leftProvider);

  const fileProvider = new FileTreeDataProvider();
  vscode.window.registerTreeDataProvider('clonedReposView', fileProvider);

  const destinationPath = path.join(os.homedir(), 'test-clone');
  if (fs.existsSync(destinationPath)) {
      fileProvider.setRepoPath(destinationPath);
  }

  function createOrRevealPanel(){
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
                    case 'highlightLinesHint':
                        vscode.commands.executeCommand('sprout.highlightLinesHint', message.label);
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
              const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
              activeFileUri = fileUri; 
              isFileOpen = true;
          } catch (error) {
              vscode.window.showErrorMessage(`Could not open file: ${fileUri}`);
          }
      } else {
          vscode.window.showWarningMessage('No cloned repository found to open the file.');
      }
    } else {
        if (vscode.window.tabGroups.all.length > 1) {
            await vscode.commands.executeCommand('workbench.action.closeOtherEditors');
        }
    }

    await vscode.commands.executeCommand('workbench.action.closePanel');
    vscode.commands.executeCommand('setContext', 'sprout.hasClonedRepo', isFileOpen);
    createOrRevealPanel();

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
              const baseDestination = path.join(os.homedir(), 'test-clone');
              const destination = path.join(baseDestination, 'mattermost');

              if (fs.existsSync(destination)) {
                  vscode.window.showInformationMessage('Project already cloned.');
                  fileProvider.setRepoPath(baseDestination);
                  return;
              }

              const fullCommand = 
                  `git clone https://github.com/mattermost/mattermost.git "${destination}" && ` +
                  `cd "${destination}" && ` +
                  `git checkout 603c26a5bcda365917285b8f32c6982e170c5cd3 && ` +
                  `cd "webapp"`;

                  // TODO: add npm install here somehow

              const shellExecution = new vscode.ShellExecution(fullCommand);
              const task = new vscode.Task(
                  { type: 'sprout-clone', name: `Cloning ${repoName}` },
                  vscode.TaskScope.Workspace,
                  `Cloning ${repoName}`,
                  'Sprout',
                  shellExecution
              );

              task.presentationOptions = {
                  reveal: vscode.TaskRevealKind.Always,
                  panel: vscode.TaskPanelKind.Shared
              };

              // vscode.commands.executeCommand('workbench.action.positionPanelRight');

              onDidEndTaskDisposable = vscode.tasks.onDidEndTask(e => {
                  if (e.execution.task.name === `Cloning ${repoName}`) {
                      vscode.window.showInformationMessage('Task ended.');
                      fileProvider.setRepoPath(baseDestination);
                  }
              });

              vscode.tasks.executeTask(task);
          } catch (error: any) {
              vscode.window.showErrorMessage(`Failed to start command execution: ${error.message}`);
          }
      }
  });

  const highlightLinesDisposable = vscode.commands.registerCommand('sprout.highlightLinesHint', async () => {
      if (!activeFileUri) {
          vscode.window.showWarningMessage('No active code editor found.');
          return;
      }

      const codeEditor = vscode.window.visibleTextEditors.find(
          editor => editor.document.uri.toString() === activeFileUri?.toString()
      );

      if (!codeEditor) {
          vscode.window.showWarningMessage('The code editor for this file is not visible.');
          return;
      }

      const line11 = codeEditor.document.lineAt(10);
      const line26 = codeEditor.document.lineAt(25);

      const linesToHighlight = [
          line11.range,
          line26.range
      ];

      codeEditor.setDecorations(hintDecorationType, linesToHighlight);
      setTimeout(() => {
          if (codeEditor) {
            codeEditor.setDecorations(hintDecorationType, []);
            // hintDecorationType.dispose();
          }
      }, 1500);
  });

  const openFileDisposable = vscode.commands.registerCommand('sprout.openFile', (uri: vscode.Uri) => {
      vscode.window.showTextDocument(uri);
  })

  context.subscriptions.push(nextItemDisposable, prevItemDisposable, cloneProjectDisposable, openFileDisposable, highlightLinesDisposable, hintDecorationType);
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
    htmlContent = htmlContent.replace(/{{TITLE}}/g, item.label)

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
    // TODO: shellConfigPath probably won't exist in the end
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

    let highlightLinesHtml = `
      <button id="highlightLinesButton">
          Show Hint: Highlight lines where changes are needed 
      </button>
    `;

    let giveHintHtml = `
      <button id="giveHintButton">
          Show Hint: See description of needed changes
      </button>
    `;

    let showSolutionHtml = `
      <button id="showSolutionButton">
          Show Hint: Reveal solution in a git diff view
      </button>
    `;

    htmlContent = htmlContent.replace('{{HIGHLIGHT_LINES_BUTTON}}', highlightLinesHtml);
    htmlContent = htmlContent.replace('{{GIVE_HINT_BUTTON}}', giveHintHtml);
    htmlContent = htmlContent.replace('{{SHOW_SOLUTION_BUTTON}}', showSolutionHtml);
    htmlContent = htmlContent.replace('{{HAS_FILE_TO_OPEN}}', item.fileToOpen ? 'true' : 'false');

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
