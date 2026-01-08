import * as vscode from 'vscode';
import { TaskProvider, Section } from './taskProvider.js'
import { FileTreeDataProvider } from './fileTreeDataProvider.js';
import * as path from 'path';
import * as fs from 'fs';
import { marked } from 'marked';

import { registerGoToNextItemCommand } from './commands/goToNextItem.js';
import { registerGoToPrevItemCommand } from './commands/goToPreviousItem.js';
import { registerOpenFileCommand } from './commands/openFile.js';
import { registerShowHintPopupCommand } from './commands/showHintPopup.js';
import { registerShowInlineHintFromLensCommand } from './commands/showInlineHintFromLens.js';
import { registerToggleHighlightCommand } from './commands/toggleHighlight.js';
import { registerShowSolutionCommand } from './commands/showSolution.js';
import { registerLineClickedCommand } from './commands/lineClicked.js';
import { inlineHintContentProvider } from './hints/inlineHintUtils.js';
import { PersistentLens } from './types/lens.js';
import { ConfigData } from './types/config.js';

const codeLensChangeEmitter = new vscode.EventEmitter<void>();

let currentPanel: vscode.WebviewPanel | undefined;
let onDidEndTaskDisposable: vscode.Disposable | undefined;
let activeFileUri: vscode.Uri | undefined;
let tempFileCopyUri: vscode.Uri | undefined;

const hintDecorationType = vscode.window.createTextEditorDecorationType({backgroundColor: "#0078d4a0"});
const clickableHintLines = new Map<string, { lines: [number, number][], hintText: string, label: string, isTemp: boolean, persistent_lenses: PersistentLens[]}>();
const scheme = 'sprouthint';

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

  const toggleHighlightDisposable = registerToggleHighlightCommand(leftProvider, () => tempFileCopyUri);
  const sectionSelectedDisposable = registerLineClickedCommand(
    context, leftProvider, fileProvider, treeView,
    clickableHintLines, codeLensChangeEmitter,
    () => tempFileCopyUri,
    uri => tempFileCopyUri = uri,
    uri => activeFileUri = uri,
    () => currentPanel,
    panel => currentPanel = panel,
    updatePanelContent,
    revealPanel
  );

  const nextItemDisposable = registerGoToNextItemCommand(leftProvider);
  const prevItemDisposable = registerGoToPrevItemCommand(leftProvider);
  const showSolutionDisposable = registerShowSolutionCommand(leftProvider, fileProvider, () => tempFileCopyUri, () => activeFileUri);
  const openFileDisposable = registerOpenFileCommand();
  const showHintPopupDisposable = registerShowHintPopupCommand(leftProvider, () => currentPanel);
  const showInlineHintFromLensDisposable = registerShowInlineHintFromLensCommand(clickableHintLines);

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
    vscode.workspace.registerTextDocumentContentProvider(scheme, inlineHintContentProvider),
    hintSchema
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
