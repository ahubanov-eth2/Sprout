import * as vscode from 'vscode';
import { TaskProvider, Section } from './taskProvider.js'
import { FileTreeDataProvider } from './fileTreeDataProvider.js';
import * as path from 'path';
import * as fs from 'fs';
import { marked } from 'marked';
import * as os from 'os';
import { exec } from 'child_process';

let currentPanel: vscode.WebviewPanel | undefined;
let onDidEndTaskDisposable: vscode.Disposable | undefined;
let activeFileUri: vscode.Uri | undefined;

const hintDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: "#0078d4a0"
});

interface ConfigData {
  setupData? : any,
  taskDescriptionFile? : string,
  codeFileToEdit? : string,
  hintLineRanges? : Array<[number, number]>,
  hint? : string
}

function getWorkspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('No workspace folder open.');
  }
  return folder.uri.fsPath;
}

export function activate(context: vscode.ExtensionContext) {

  const projectsDirectory = path.join(
    getWorkspaceRoot(),
    'data',
    'project-repository'
  );

  const leftProvider = new TaskProvider(context);
  vscode.window.registerTreeDataProvider('leftView', leftProvider);

  const fileProvider = new FileTreeDataProvider();
  vscode.window.registerTreeDataProvider('clonedReposView', fileProvider);

  if (fs.existsSync(projectsDirectory)) {
      fileProvider.setRepoPath(projectsDirectory);
  }

  function revealPanel(){
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
                    case 'highlightLinesHint':
                        vscode.commands.executeCommand('sprout.highlightLinesHint', message.label);
                        break;
                    case 'showSolution':
                        vscode.commands.executeCommand('sprout.showSolution', message.label);
                        break;
                    case 'getHintText':
                        vscode.commands.executeCommand('sprout.showHintPopup', message.label);
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

  const sectionSelectedDisposable = vscode.commands.registerCommand('sprout.lineClicked', async (item: Section) => {
    
    const { siblings, currentIndex } = leftProvider.getLeafSiblings(item);
    const parent = leftProvider.findParent(leftProvider.getRoot(), item);
    const parentLabel = (parent !== undefined) ? parent.label : ""

    let configData: ConfigData = {};
    if (item.configFilePath)
    {
      const config = fs.readFileSync(item.configFilePath, "utf8");
      configData = JSON.parse(config);
    }

    let isCodeFileOpen = false;
    if (configData.codeFileToEdit) {
      const repoDirectory = fileProvider.getRepoPath();
      if (repoDirectory) {
          const fileUri = vscode.Uri.file(path.join(repoDirectory, configData.codeFileToEdit));
          try {
              const doc = await vscode.workspace.openTextDocument(fileUri);
              await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
              activeFileUri = fileUri; 
              isCodeFileOpen = true;
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
    vscode.commands.executeCommand('setContext', 'sprout.hasClonedRepo', isCodeFileOpen);
    revealPanel();

    if (isCodeFileOpen && currentPanel) {
        const editor = vscode.window.visibleTextEditors.find(
            e => e.document.uri.toString() === activeFileUri?.toString()
        );
        if (editor) {
            await vscode.window.showTextDocument(editor.document, vscode.ViewColumn.One);
            await vscode.commands.executeCommand('workbench.action.splitEditorToBelowGroup');
        }
    }


    if (currentPanel) {
        updatePanelContent(currentPanel, item, siblings, currentIndex, parentLabel);
    }
  });
  context.subscriptions.push(sectionSelectedDisposable);

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

  const showSolutionDisposable = vscode.commands.registerCommand('sprout.showSolution', async (label: string) => {
      if (!activeFileUri) {
          vscode.window.showWarningMessage('No active code editor found.');
          return;
      }
      
      const currentItem = leftProvider.findLeafByLabel(label);

      let configData: ConfigData = {};
      if (currentItem && currentItem.configFilePath)
      {
        const config = fs.readFileSync(currentItem.configFilePath, "utf8");
        configData = JSON.parse(config);
      }

      const lineRanges = configData.hintLineRanges as [number, number][] 

      const startLine = lineRanges[0][0] - 1
      const endLine = lineRanges[lineRanges.length - 1][1] 

      const repoPath = fileProvider.getRepoPath() as string;
      const relativeFilePath = path.relative(repoPath, activeFileUri.fsPath);

      const solutionCommand = `git --git-dir=${path.join(repoPath, '.git')} show ${process.env.COMMIT}:${relativeFilePath}`;
      const currentCommand = `cat ${path.join(repoPath, relativeFilePath)}`;

      let solutionContent: string;
      let currentContent: string;

      try {
          const solutionResult = await new Promise<string>((resolve, reject) => {
              exec(solutionCommand, { cwd: repoPath }, (err, stdout, stderr) => {
                  if (err) {
                      reject(new Error(`Failed to get solution content: ${stderr}`));
                  }
                  resolve(stdout);
              });
          });

          const currentResult = await new Promise<string>((resolve, reject) => {
              exec(currentCommand, { cwd: repoPath }, (err, stdout, stderr) => {
                  if (err) {
                      reject(new Error(`Failed to get current content: ${stderr}`));
                  }
                  resolve(stdout);
              });
          });

          solutionContent = solutionResult;
          currentContent = currentResult;

          const currentLines = currentContent.split('\n').slice(startLine, endLine);
          const solutionLines = solutionContent.split('\n').slice(startLine, endLine);

          const currentTempFilePath = path.join(os.tmpdir(), `current-temp-${path.basename(relativeFilePath)}`);
          const solutionTempFilePath = path.join(os.tmpdir(), `solution-temp-${path.basename(relativeFilePath)}`);
          const currentTempFileUri = vscode.Uri.file(currentTempFilePath);
          const solutionTempFileUri = vscode.Uri.file(solutionTempFilePath);
          
          fs.writeFileSync(currentTempFilePath, currentLines.join('\n'));
          fs.writeFileSync(solutionTempFilePath, solutionLines.join('\n'));

          const title = `Solution for lines ${startLine}-${endLine} of ${path.basename(activeFileUri.fsPath)}`;
          await vscode.commands.executeCommand('vscode.diff', currentTempFileUri, solutionTempFileUri, title);

          setTimeout(() => {
              fs.unlink(currentTempFilePath, (err) => err && console.error('Failed to delete temp file:', err));
              fs.unlink(solutionTempFilePath, (err) => err && console.error('Failed to delete temp file:', err));
          }, 5000);

      } catch (e: any) {
          vscode.window.showErrorMessage(e.message);
          return;
      }
  })

  const highlightLinesDisposable = vscode.commands.registerCommand('sprout.highlightLinesHint', async (label: string) => {
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

      const currentItem = leftProvider.findLeafByLabel(label);

      let configData: ConfigData = {};
      if (currentItem && currentItem.configFilePath)
      {
        const config = fs.readFileSync(currentItem.configFilePath, "utf8");
        configData = JSON.parse(config);
      }

      const lineRanges = configData.hintLineRanges as [number, number][] 

      const linesToHighlight = (lineRanges || []).map((range: number[]) => {
        const [startLine, endLine] = range;

        const lineRangeInstance = new vscode.Range(
          startLine - 1, 
          0, 
          endLine - 2, // TODO: figure out correct indexing
          1000000 
        );

        return {
          range: lineRangeInstance
        };
      });

      codeEditor.setDecorations(hintDecorationType, linesToHighlight);
      setTimeout(() => {
          if (codeEditor) {
            codeEditor.setDecorations(hintDecorationType, []);
          }
      }, 1500);
  });

  const openFileDisposable = vscode.commands.registerCommand('sprout.openFile', (uri: vscode.Uri) => {
      vscode.window.showTextDocument(uri);
  })

  const showHintPopupDisposable = vscode.commands.registerCommand('sprout.showHintPopup', async (label: string) => {
    vscode.commands.executeCommand('sprout.highlightLinesHint', label);
    
    const currentItem = leftProvider.findLeafByLabel(label);

    let configData: ConfigData = {};
    if (currentItem && currentItem.configFilePath)
    {
      const config = fs.readFileSync(currentItem.configFilePath, "utf8");
      configData = JSON.parse(config);
    }

    const hintText = configData.hint; 
    if (!hintText) {
        vscode.window.showWarningMessage(`No hint file found for section: ${label}`);
        return;
    }

    try {
      if (currentPanel) {
        currentPanel.webview.postMessage({
            command: 'displayHintText',
            text: hintText
        });
      }
    } catch (e) {
        vscode.window.showErrorMessage(`Error reading hint file: ${e instanceof Error ? e.message : String(e)}`);
    }


  })

  context.subscriptions.push(
    nextItemDisposable, 
    prevItemDisposable, 
    openFileDisposable, 
    showSolutionDisposable,
    highlightLinesDisposable,
    showHintPopupDisposable, 
    hintDecorationType
  );
}


function getWebviewContent(
  item: any, 
  siblings: Section[], 
  currentIndex: number,
  parentLabel: string
): string 
{
    const uri = vscode.Uri.joinPath(
      vscode.extensions.getExtension('ahubanov.sprout')!.extensionUri,
      'media',
      'rightPanelWebView.html'
    );
    let htmlContent = fs.readFileSync(uri.fsPath, 'utf8');

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

    let configData: ConfigData = {};
    if (item && item.configFilePath)
    {
      const config = fs.readFileSync(item.configFilePath, "utf8");
      configData = JSON.parse(config);
    }

    let description = '';
    if (configData.taskDescriptionFile)
    {
      try {
          const fullTaskDescriptionFile = vscode.Uri.joinPath(
            vscode.extensions.getExtension('ahubanov.sprout')!.extensionUri,
            'data',
            'structured-courses',
            configData.taskDescriptionFile
          );
          const markdownContent = fs.readFileSync(fullTaskDescriptionFile.fsPath, 'utf8');
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

    htmlContent = htmlContent.replace('{{DESCRIPTION}}', description);
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
    htmlContent = htmlContent.replace('{{HAS_FILE_TO_OPEN}}', configData.codeFileToEdit ? 'true' : 'false');

    return htmlContent;
}

function updatePanelContent(
  panel: vscode.WebviewPanel, 
  item: Section, 
  siblings: Section[], 
  currentIndex: number,
  parentLabel: string
) {
  panel.title = `${item.label}`;
  panel.webview.html = getWebviewContent(item, siblings, currentIndex, parentLabel); 
}

export function deactivate() {}
