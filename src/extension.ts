import * as vscode from 'vscode';
import { TaskProvider, Section } from './taskProvider.js'
import { FileTreeDataProvider } from './fileTreeDataProvider.js';
import * as path from 'path';
import * as fs from 'fs';
import { marked } from 'marked';
import * as os from 'os';
import { exec } from 'child_process';

import { registerGoToNextItemCommand } from './commands/goToNextItem';
import { registerGoToPrevItemCommand } from './commands/goToPreviousItem';
import { registerOpenFileCommand } from './commands/openFile';

const codeLensChangeEmitter = new vscode.EventEmitter<void>();

let currentPanel: vscode.WebviewPanel | undefined;
let onDidEndTaskDisposable: vscode.Disposable | undefined;
let activeFileUri: vscode.Uri | undefined;
let tempFileCopyUri: vscode.Uri | undefined;

const hintDecorationType = vscode.window.createTextEditorDecorationType({ backgroundColor: "#0078d4a0" });
const clickableHintLines = new Map<string, { lines: [number, number][], hintText: string, label: string, isTemp: boolean, persistent_lenses: PersistentLens[]}>();

type PersistentLens = {
    line: number;
    explanation: string; 
};

interface ConfigData {
  setupData? : any,
  taskDescriptionFile? : string,
  codeFileToEdit? : string,
  hintLineRangesCurrent? : Array<[number, number]>,
  hintLineRangesSolution? : Array<[number, number]>,
  diffLineRangesCurrent? : Array<[number, number]>,
  hint? : string
  persistentLenses? : PersistentLens[]
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

    return `${formattedText}`;
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

  const fileProvider = new FileTreeDataProvider();
  vscode.window.registerTreeDataProvider('clonedReposView', fileProvider);

  if (fs.existsSync(projectsDirectory)) {
      fileProvider.setRepoPath(projectsDirectory);
  }

  const listener = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor) return;

      if (editor.document.fileName.endsWith('data/project-repository/dev-test/index.html')) {

          await new Promise(r => setTimeout(r, 1000));

          try {
              await vscode.commands.executeCommand('extension.liveServer.goOnline');
              vscode.window.showInformationMessage('Sprout: Decap CMS launched on Live Server 🚀');
          } catch (err) {
              console.error('Failed to launch Live Server:', err);
          }
      }
  });
  context.subscriptions.push(listener);

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

  vscode.workspace.onDidChangeTextDocument(event => {
      const uri = event.document.uri.toString();
      const hintInfo = clickableHintLines.get(uri);

      if (!hintInfo || !hintInfo.persistent_lenses) return;

      event.contentChanges.forEach(change => {
          const startLine = change.range.start.line + 1;
          const endLine = change.range.end.line + 1;

          hintInfo.persistent_lenses = hintInfo.persistent_lenses.filter(lens => {
              const line = Number(lens.line);
              const isWithinDeletedRange = line >= startLine && line <= endLine;
              
              return !isWithinDeletedRange;
          });
          
          const linesAdded = change.text.split('\n').length - 1;
          const linesRemoved = endLine - startLine;
          const lineDelta = linesAdded - linesRemoved;

          if (lineDelta !== 0) {
            hintInfo.persistent_lenses = hintInfo.persistent_lenses.map(lens => {
                const currentLine = Number(lens.line);
                if (currentLine > startLine) {
                    return { ...lens, line: currentLine + lineDelta };
                }

                return lens;
            });
          }
      });

      codeLensChangeEmitter.fire();
  });

  function revealPanel(){
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.One, true);
    } else {
        const extensionMediaUri = vscode.Uri.joinPath(context.extensionUri, 'media');
        currentPanel = vscode.window.createWebviewPanel(
          'myRightPanel',
          'My Right Panel',
          { viewColumn: vscode.ViewColumn.One, preserveFocus: true },
          { enableScripts: true, enableFindWidget: true, localResourceRoots: [extensionMediaUri] }
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

      const hintUri = vscode.Uri.parse(
        `sprout-hint:Hint for ${label}.md?${encodeURIComponent(hintText)}`
      );
      const hintDoc = await vscode.workspace.openTextDocument(hintUri);

      await vscode.window.showTextDocument(hintDoc, {
        viewColumn: vscode.ViewColumn.Two,
        preserveFocus: true,
        preview: false
      });

      // const tempDoc = await vscode.workspace.openTextDocument(tempFileCopyUri);
      // const codeEditor = await vscode.window.showTextDocument(tempDoc, {
      //   viewColumn: vscode.ViewColumn.One,
      //   preserveFocus: false,  
      //   preview: false          
      // });

      // const lineOffset = 1;
      // const lineRanges = configData.hintLineRangesCurrent as [number, number][];
      // const linesToHighlight = (lineRanges || []).map(([startLine, endLine]) => ({
      //     range: new vscode.Range(startLine - 1, 0, endLine, 1000000) // the -1 is because of the warning message that is to be added
      // }));

      // const firstHighlightedStart = (lineRanges[0][0] - 1);
      // const headerRange = new vscode.Range(
      //     new vscode.Position(firstHighlightedStart, 0),
      //     new vscode.Position(firstHighlightedStart, 0)
      // );

      // codeEditor.setDecorations(warningHeaderDecorationType, [headerRange]);
      // codeEditor.setDecorations(hintDecorationType, linesToHighlight);

      // if (lineRanges && lineRanges.length > 0) {
      //   const [firstStart] = lineRanges[0];
      //   const targetPos = new vscode.Position(firstStart - 1 + lineOffset, 0);
      //   const targetRange = new vscode.Range(targetPos, targetPos);

      //   codeEditor.revealRange(targetRange, vscode.TextEditorRevealType.AtTop);
      //   codeEditor.selection = new vscode.Selection(targetPos, targetPos);
      // }
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

    const repoDirectory = fileProvider.getRepoPath();

    let isCodeFileOpen = false;
    if (configData.codeFileToEdit) {
      const repoDirectory = fileProvider.getRepoPath();
      if (repoDirectory) {
          const fileUri = vscode.Uri.file(path.join(repoDirectory, configData.codeFileToEdit));
          try {

              if (!tempFileCopyUri)
              {              
                  const tempFileName = `temp_${Date.now()}_${path.basename(fileUri.fsPath)}`;
                  const tempFilePath = path.join(os.tmpdir(), tempFileName);

                  const tsIgnoreHeader = "// @ts-nocheck\n"; 
                  const originalContent = fs.readFileSync(fileUri.fsPath, 'utf-8');
                  const tempFileContent = tsIgnoreHeader + originalContent;

                  tempFileCopyUri = vscode.Uri.file(tempFilePath);
                  fs.writeFileSync(tempFileCopyUri.fsPath, tempFileContent);
              }

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

              const codeEditor = vscode.window.visibleTextEditors.find(
                editor => editor.viewColumn === vscode.ViewColumn.One
              );

              if (configData.persistentLenses && codeEditor) {
                const persistentLenses = (configData.persistentLenses || []).map(l => ({
                  line: Number(l.line),
                  explanation: String(l.explanation)
                }));

                const hintInfo = {
                    lines: [],
                    hintText: '',
                    label: item.label,
                    isTemp: false,
                    persistent_lenses: persistentLenses
                };

                clickableHintLines.set(codeEditor.document.uri.toString(), hintInfo);
                codeLensChangeEmitter.fire();
              }
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
            { enableScripts: true, enableFindWidget: true }
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

    let terminal = vscode.window.terminals.find(t => t.name === 'Sprout Terminal');
    if (!terminal) {
        terminal = vscode.window.createTerminal({
            name: 'Sprout Terminal',
            cwd: repoDirectory
        });
    }
    terminal.show();
  });

  const nextItemDisposable = registerGoToNextItemCommand(leftProvider);
  const prevItemDisposable = registerGoToPrevItemCommand(leftProvider);
  const openFileDisposable = registerOpenFileCommand();

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

      // const lineRangesCurrent = configData.diffLineRangesCurrent as [number, number][]
      // const lineRangesSolution = configData.hintLineRangesSolution as [number, number][]  

      // const startLineCurrent = lineRangesCurrent[0][0]
      // const endLineCurrent = lineRangesCurrent[lineRangesCurrent.length - 1][1] 

      // const startLineSolution = lineRangesSolution[0][0]
      // const endLineSolution = lineRangesSolution[lineRangesSolution.length - 1][1] 

      const repoPath = fileProvider.getRepoPath() as string;
      const relativeFilePath = path.relative(repoPath, activeFileUri.fsPath);

      const solutionCommand = `git --git-dir=${path.join(repoPath, '.git')} show ${process.env.COMMIT}:${relativeFilePath}`;

      // let solutionContent: string;
      try {
          const solutionResult = await new Promise<string>((resolve, reject) => {
              exec(solutionCommand, { cwd: repoPath }, (err, stdout, stderr) => {
                  if (err) {
                      reject(new Error(`Failed to get solution content: ${stderr}`));
                  }
                  resolve(stdout);
              });
          });

          // solutionContent = solutionResult;
          const currentContent = fs.readFileSync(tempFileCopyUri.fsPath, 'utf8');

          // let currentLines: string[] = [];
          // if (hasCurrentRange) {
          //     currentLines = currentContent
          //         .split('\n')
          //         .slice(startLineCurrent - 1, endLineCurrent);
          // } else {
          //     currentLines = [];
          // }

          // const solutionLines = solutionContent.split('\n').slice(startLineSolution - 1, endLineSolution);

          const currentTempFilePath = path.join(os.tmpdir(), `current-temp-${path.basename(relativeFilePath)}`);
          const solutionTempFilePath = path.join(os.tmpdir(), `solution-temp-${path.basename(relativeFilePath)}`);

          const currentTempFileUri = vscode.Uri.file(currentTempFilePath);
          const solutionTempFileUri = vscode.Uri.file(solutionTempFilePath);
          
          // fs.writeFileSync(currentTempFilePath, currentLines.join('\n'));
          // fs.writeFileSync(solutionTempFilePath, solutionLines.join('\n'));

          fs.writeFileSync(currentTempFilePath, currentContent);
          fs.writeFileSync(solutionTempFilePath, solutionResult);

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
    (uri: vscode.Uri, lens: PersistentLens) => {
      const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
      const info = clickableHintLines.get(uri.toString());
      if (!editor || !info) return;

      const line_to_show = lens.line - 1;
      showInlineHint(editor, line_to_show, lens.explanation);
      return;
    }
  );

  const codeLensProviderDisposable = vscode.languages.registerCodeLensProvider({ pattern: '**/*' }, {
    provideCodeLenses(document) {
      const hintInfo = clickableHintLines.get(document.uri.toString());
      const lenses: vscode.CodeLens[] = [];

      if (!hintInfo) return lenses;

      if (hintInfo.persistent_lenses) {
        for (const pl of hintInfo.persistent_lenses) {

          const lensArg = { line: Number(pl.line), explanation: String(pl.explanation) };
          const range = new vscode.Range(lensArg.line - 1, 0, lensArg.line - 1, 0);

          lenses.push(
            new vscode.CodeLens(range, {
              title: "💬 Learn more",
              command: 'sprout.showInlineHintFromLens',
              arguments: [document.uri, lensArg]
            })
          );
        }
      }

      return lenses;
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

function showInlineHint(editor: vscode.TextEditor, line: number, hintText: string) {
  const startPos = new vscode.Position(line, 0);

  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const virtualDocUri = vscode.Uri.parse(`sprouthint:${uniqueId}.md`);

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
  parentLabel: string,
  webview: vscode.Webview
): string 
{
    const mediaFolderUri = vscode.Uri.joinPath(
      vscode.extensions.getExtension('ahubanov.sprout')!.extensionUri,
      'media'
    );

    const image1Uri = webview.asWebviewUri(vscode.Uri.joinPath(mediaFolderUri, 'broken.png'));
    const image2Uri = webview.asWebviewUri(vscode.Uri.joinPath(mediaFolderUri, 'fixed.png'));

    const uri = vscode.Uri.joinPath(
      vscode.extensions.getExtension('ahubanov.sprout')!.extensionUri,
      'media',
      'rightPanelWebView.html'
    );
    let htmlContent = fs.readFileSync(uri.fsPath, 'utf8');

    htmlContent = htmlContent.replace('{{PARENT_TITLE}}', parentLabel);

    htmlContent = htmlContent
      .replace('{{IMAGE1}}', image1Uri.toString())
      .replace('{{IMAGE2}}', image2Uri.toString());

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

          description = description.replace(/src="([^"]+)"/g, (match, imgName) => {
            const normalized = imgName.replace(/^\.?\//, "");

            if (normalized.endsWith("broken.png")) return `src="${image1Uri}"`;
            if (normalized.endsWith("fixed.png")) return `src="${image2Uri}"`;

            return match;
          });
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
          Show hint
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
  parentLabel: string,
) {
  panel.title = `${item.label}`;
  panel.webview.html = getWebviewContent(item, siblings, currentIndex, parentLabel, panel.webview); 
}

export function deactivate() {}
