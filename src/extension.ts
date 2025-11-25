import * as vscode from 'vscode';
import { TaskProvider, Section } from './taskProvider.js'
import { FileTreeDataProvider } from './fileTreeDataProvider.js';
import * as path from 'path';
import * as fs from 'fs';
import { marked } from 'marked';
import * as os from 'os';
import { exec } from 'child_process';

const codeLensChangeEmitter = new vscode.EventEmitter<void>();

let currentPanel: vscode.WebviewPanel | undefined;
let onDidEndTaskDisposable: vscode.Disposable | undefined;
let activeFileUri: vscode.Uri | undefined;
let tempFileCopyUri: vscode.Uri | undefined;

const hintDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: "#0078d4a0"
});

const clickableHintLines = new Map<string, { lines: [number, number][], hintText: string, label: string }>();

interface ConfigData {
  setupData? : any,
  taskDescriptionFile? : string,
  codeFileToEdit? : string,
  hintLineRangesCurrent? : Array<[number, number]>,
  hintLineRangesSolution? : Array<[number, number]>,
  hint? : string
}

function getWorkspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('No workspace folder open.');
  }
  return folder.uri.fsPath;
}

const scheme = 'sprouthint';
const hintTexts = new Map<string, string>();

const provider = new class implements vscode.TextDocumentContentProvider {
  onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  onDidChange = this.onDidChangeEmitter.event;
  provideTextDocumentContent(uri: vscode.Uri): string {
    const key = uri.path;
    const text = hintTexts.get(key) ?? 'No hint available.';

    const formattedText = text
    .split(/\s+/)
    .reduce((acc, word, i) => {
      const sep = (i + 1) % 5 === 0 ? '\n' : ' ';
      return acc + word + sep;
    }, '');

    return `Needed changes:\n\n${formattedText}`;
  }
};


export function activate(context: vscode.ExtensionContext) {

  const projectsDirectory = path.join(
    getWorkspaceRoot(),
    'data',
    'project-repository'
  );

  const leftProvider = new TaskProvider(context);
  const treeView = vscode.window.createTreeView('leftView', {
    treeDataProvider: leftProvider
  });
  // vscode.window.registerTreeDataProvider('leftView', leftProvider);

  const fileProvider = new FileTreeDataProvider();
  vscode.window.registerTreeDataProvider('clonedReposView', fileProvider);

  if (fs.existsSync(projectsDirectory)) {
      fileProvider.setRepoPath(projectsDirectory);
  }

  const warningHeaderDecorationType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor('editor.background'),
      before: {
          contentText: "⚠️ This is the original code file discounting changes made by you (if any)",
          color: new vscode.ThemeColor('editorWarning.foreground'),
          fontWeight: 'bold',
          fontStyle: 'italic',
          margin: '0 0 0 20px',
      },
      after: {
          contentText: " ⚠️",
          color: new vscode.ThemeColor('editorWarning.foreground'),
      },
      borderWidth: '0 0 1px 0',
      borderColor: new vscode.ThemeColor('editorWarning.foreground'),
      borderStyle: 'solid'
  });

  vscode.workspace.onDidChangeTextDocument(event => {
      if (tempFileCopyUri && event.document.uri.toString() === tempFileCopyUri.toString()) {
          const edit = new vscode.WorkspaceEdit();

          edit.replace(
              event.document.uri,
              new vscode.Range(0, 0, event.document.lineCount, 0),
              event.document.getText()
          );
          vscode.workspace.applyEdit(edit);
      }
  });

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
                    case 'showSolution':
                        vscode.commands.executeCommand('sprout.showSolution', message.label);
                        break;
                    case 'getHintText':
                        vscode.commands.executeCommand('sprout.showHintPopup', message.label);
                        break;
                    case 'toggleHighlight':
                        vscode.commands.executeCommand('sprout.toggleHighlight', message.label);
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

  const toggleHighlightDisposable = vscode.commands.registerCommand('sprout.toggleHighlight', async (label: string) => {
      if (!tempFileCopyUri) {
          vscode.window.showWarningMessage('No active code editor found.');
          return;
      }

      const currentItem = leftProvider.findLeafByLabel(label);
      if (!currentItem) return;

      let configData: ConfigData = {};
      if (currentItem.configFilePath) {
          const config = fs.readFileSync(currentItem.configFilePath, "utf8");
          configData = JSON.parse(config);
      }
      const hintText = configData.hint || '';

      const tempDoc = await vscode.workspace.openTextDocument(tempFileCopyUri);
      const codeEditor = await vscode.window.showTextDocument(tempDoc, {
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: false,  
        preview: false          
      });

      const hintUri = vscode.Uri.parse(
          `sprout-hint:${label}.md?${encodeURIComponent(hintText)}`
      );
      const hintDoc = await vscode.workspace.openTextDocument(hintUri);

      await vscode.window.showTextDocument(hintDoc, {
        viewColumn: vscode.ViewColumn.Two,
        preserveFocus: true,
        preview: false
      });

      const lineOffset = 1;
      const lineRanges = configData.hintLineRangesCurrent as [number, number][];
      const linesToHighlight = (lineRanges || []).map(([startLine, endLine]) => ({
          range: new vscode.Range((startLine - 1) + lineOffset, 0, (endLine - 2) + lineOffset, 1000000)
      }));

      const firstHighlightedStart = (lineRanges[0][0] - 1) + lineOffset;
      const headerRange = new vscode.Range(
          new vscode.Position(firstHighlightedStart, 0),
          new vscode.Position(firstHighlightedStart, 0)
      );

      codeEditor.setDecorations(warningHeaderDecorationType, [headerRange]);
      codeEditor.setDecorations(hintDecorationType, linesToHighlight);

      clickableHintLines.set(codeEditor.document.uri.toString(), {
        lines: lineRanges,
        hintText: hintText,
        label: label
      });

      if (lineRanges && lineRanges.length > 0) {
        const [firstStart] = lineRanges[0];
        const targetPos = new vscode.Position(firstStart - 1 + lineOffset, 0);
        const targetRange = new vscode.Range(targetPos, targetPos);

        codeEditor.revealRange(targetRange, vscode.TextEditorRevealType.AtTop);
        codeEditor.selection = new vscode.Selection(targetPos, targetPos);
      }
  });

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
              const tempFileName = `temp_${Date.now()}_${path.basename(fileUri.fsPath)}`;
              const tempFilePath = path.join(os.tmpdir(), tempFileName);

              const tsIgnoreHeader = "// @ts-nocheck\n"; 
              const originalContent = fs.readFileSync(fileUri.fsPath, 'utf-8');
              const tempFileContent = tsIgnoreHeader + originalContent;

              tempFileCopyUri = vscode.Uri.file(tempFilePath);
              fs.writeFileSync(tempFileCopyUri.fsPath, tempFileContent);

              const doc = await vscode.workspace.openTextDocument(fileUri);
              await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
              activeFileUri = fileUri; 
              isCodeFileOpen = true;

              let terminal = vscode.window.terminals.find(t => t.name === 'Sprout Terminal');
              if (!terminal) {
                terminal = vscode.window.createTerminal({
                  name: 'Sprout Terminal',
                  cwd: repoDirectory
                });
              }
              terminal.show();

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

    if (isCodeFileOpen)
    {
        if (currentPanel) {
            currentPanel.dispose();
        }

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
                    case 'showSolution':
                        vscode.commands.executeCommand('sprout.showSolution', message.label);
                        break;
                    case 'getHintText':
                        vscode.commands.executeCommand('sprout.showHintPopup', message.label);
                        break;
                    case 'toggleHighlight':
                        vscode.commands.executeCommand('sprout.toggleHighlight', message.label);
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
    else
    {
        revealPanel();
    }

    if (currentPanel) {
        updatePanelContent(currentPanel, item, siblings, currentIndex, parentLabel);
    }

    if (treeView) {
      await treeView.reveal(item, { expand: true, focus: true, select: true });
    }
  });

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
      if (!tempFileCopyUri || !activeFileUri) {
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

      const lineRangesCurrent = configData.hintLineRangesCurrent as [number, number][]
      const lineRangesSolution = configData.hintLineRangesSolution as [number, number][]  

      const startLineCurrent = lineRangesCurrent[0][0] - 1
      const endLineCurrent = lineRangesCurrent[lineRangesCurrent.length - 1][1] 

      const startLineSolution = lineRangesSolution[0][0] - 1
      const endLineSolution = lineRangesSolution[lineRangesSolution.length - 1][1] 

      const repoPath = fileProvider.getRepoPath() as string;
      const relativeFilePath = path.relative(repoPath, activeFileUri.fsPath);

      const solutionCommand = `git --git-dir=${path.join(repoPath, '.git')} show ${process.env.COMMIT}:${relativeFilePath}`;

      let solutionContent: string;
      try {
          const solutionResult = await new Promise<string>((resolve, reject) => {
              exec(solutionCommand, { cwd: repoPath }, (err, stdout, stderr) => {
                  if (err) {
                      reject(new Error(`Failed to get solution content: ${stderr}`));
                  }
                  resolve(stdout);
              });
          });

          solutionContent = solutionResult;
          const currentContent = fs.readFileSync(tempFileCopyUri.fsPath, 'utf8');

          const currentLines = currentContent.split('\n').slice(startLineCurrent, endLineCurrent);
          const solutionLines = solutionContent.split('\n').slice(startLineSolution, endLineSolution);

          const currentTempFilePath = path.join(os.tmpdir(), `current-temp-${path.basename(relativeFilePath)}`);
          const solutionTempFilePath = path.join(os.tmpdir(), `solution-temp-${path.basename(relativeFilePath)}`);

          const currentTempFileUri = vscode.Uri.file(currentTempFilePath);
          const solutionTempFileUri = vscode.Uri.file(solutionTempFilePath);
          
          fs.writeFileSync(currentTempFilePath, currentLines.join('\n'));
          fs.writeFileSync(solutionTempFilePath, solutionLines.join('\n'));

          const title = `Original vs Solution (${path.basename(relativeFilePath)})`;
          await vscode.commands.executeCommand(
            'vscode.diff',
            currentTempFileUri,
            solutionTempFileUri,
            title,
            { viewColumn: vscode.ViewColumn.Active, preview: false }
          );

      } catch (e: any) {
          vscode.window.showErrorMessage(e.message);
          return;
      }
  })

  const openFileDisposable = vscode.commands.registerCommand('sprout.openFile', (uri: vscode.Uri) => {
      vscode.window.showTextDocument(uri);
  })

  const showHintPopupDisposable = vscode.commands.registerCommand('sprout.showHintPopup', async (label: string) => {
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

  const showInlineHintFromLensDisposable = vscode.commands.registerCommand(
    'sprout.showInlineHintFromLens',
    (uri: vscode.Uri, line: number) => {
      const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
      const info = clickableHintLines.get(uri.toString());
      if (!editor || !info) return;

      const rangeClicked = info.lines.find(([start, end]) => line >= start && line <= end);
      if (rangeClicked) {
        showInlineHint(editor, rangeClicked, info.hintText);
      }
    }
  );

  const codeLensProviderDisposable = vscode.languages.registerCodeLensProvider({ pattern: '**/*' }, {
    provideCodeLenses(document) {
      const hintInfo = clickableHintLines.get(document.uri.toString());
      if (!hintInfo) return [];

      const [firstStart] = hintInfo.lines[0];
      const range = new vscode.Range(firstStart - 1, 0, firstStart - 1, 0);

      return [
        new vscode.CodeLens(range, {
          title: '💬 Hint',
          command: 'sprout.showInlineHintFromLens',
          arguments: [document.uri, firstStart]
        }),
        new vscode.CodeLens(range, {
          title: '🧩 Show Solution',
          command: 'sprout.showSolution',
          arguments: [hintInfo.label]
        })
      ];
    },
    onDidChangeCodeLenses: codeLensChangeEmitter.event
  });

  const hintSchema = vscode.workspace.registerTextDocumentContentProvider('sprout-hint', {
      provideTextDocumentContent(uri) {
          return decodeURIComponent(uri.query);
      }
  });

  context.subscriptions.push(
    nextItemDisposable, 
    prevItemDisposable, 
    openFileDisposable, 
    showSolutionDisposable,
    showHintPopupDisposable, 
    hintDecorationType,
    showInlineHintFromLensDisposable,
    codeLensProviderDisposable,
    toggleHighlightDisposable,
    sectionSelectedDisposable,
    vscode.workspace.registerTextDocumentContentProvider(scheme, provider),
    hintSchema
  );
}

function showInlineHint(editor: vscode.TextEditor, range: [number, number], hintText: string) {
  const [startLine, endLine] = range;
  const startPos = new vscode.Position(startLine, 0);

  const virtualDocUri = vscode.Uri.parse(`sprouthint:${editor.document.fileName}`);
  hintTexts.set(virtualDocUri.path, hintText);

  vscode.commands.executeCommand(
    'editor.action.peekLocations',
    editor.document.uri,
    startPos,
    [new vscode.Location(virtualDocUri, new vscode.Position(0, 0))],
    'peek'
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
          Show hint and highlight lines where changes are needed
      </button>
    `;

    let showSolutionHtml = `
      <button id="showSolutionButton">
          Show solution as a git diff 
      </button>
    `;


    htmlContent = htmlContent.replace('{{HIGHLIGHT_LINES_BUTTON}}', highlightLinesHtml);
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
