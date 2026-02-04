import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { marked } from 'marked';

import { Section } from '../providers/taskProvider.js';
import { ExtensionState } from '../types/types.js';
import { FileTreeDataProvider } from '../providers/fileTreeDataProvider.js';
import { ChecklistItem, ConfigData } from '../types/types.js';

export function createWebviewPanel(
  context: vscode.ExtensionContext,
  viewColumn: vscode.ViewColumn,
  useMediaFolder: boolean = false
): vscode.WebviewPanel {

  const localResourceRoots = useMediaFolder ? [vscode.Uri.joinPath(context.extensionUri, 'media')] : undefined;
  const panel =
    vscode.window.createWebviewPanel(
      'myRightPanel',
      'My Right Panel',
      { viewColumn, preserveFocus: true },
      { enableScripts: true, enableFindWidget: true, localResourceRoots }
    );

  return panel;
}

export function updatePanelContent(
  context: vscode.ExtensionContext,
  state: ExtensionState,
  panel: vscode.WebviewPanel, 
  item: Section, 
  siblings: Section[], 
  currentIndex: number,
  parentLabel: string,
  fileProvider: FileTreeDataProvider
) {

  const checklistState =
  context.workspaceState.get<Record<string, boolean>>(
    `sprout:checklist:${item.label}`,
    {}
  );

  panel.title = `${item.label}`;
  panel.webview.html = getWebviewContent(context, item, siblings, currentIndex, parentLabel, panel.webview, fileProvider, state, checklistState); 
}

export function registerWebviewMessageHandlers(
  context: vscode.ExtensionContext,
  state: ExtensionState
) {
    state.currentPanel?.webview.onDidReceiveMessage(
        async message => {
          switch (message.command) {
            case 'goToIndex': 
              vscode.commands.executeCommand('sprout.goToItemByIndex', message.label, message.index);
              break;
            case 'nextItem':
              vscode.commands.executeCommand('sprout.goToNextItem', message.label);
              break;
            case 'scrollToLine':
              const lensId = message.line;
              if (!state.activeFileUri) return;

              const hintInfo = state.clickableHintLines.get(state.activeFileUri.toString());
              if (!hintInfo) return;

              const lens = hintInfo.persistent_lenses.find(l => l.id === lensId);
              if (!lens) return;

              const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === state.activeFileUri?.toString());
              if (editor) {
                  const range = new vscode.Range(lens.line - 1, 0, lens.line - 1, 0);
                  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                  editor.selection = new vscode.Selection(range.start, range.end);
              }
              break;
            case 'prevItem':
              vscode.commands.executeCommand('sprout.goToPrevItem',message.label);
              break;
            case 'showSolution':
              vscode.commands.executeCommand('sprout.showSolution',message.label);
              break;
            case 'getHintText':
              vscode.commands.executeCommand('sprout.showHintPopup',message.label);
              break;
            case 'toggleHighlight':
              vscode.commands.executeCommand('sprout.toggleHighlight',message.label);
              break;
            case 'saveChecklistState':
              context.workspaceState.update(
                  `sprout:checklist:${message.label}`,
                  message.state
              );
              break;  
          }
        },
        undefined,
        context.subscriptions
      );

      state.currentPanel?.onDidDispose(() => {
        state.currentPanel = undefined;
      }, null, context.subscriptions);
};

function getWebviewContent(
  context: vscode.ExtensionContext,
  item: any, 
  siblings: Section[], 
  currentIndex: number,
  parentLabel: string,
  webview: vscode.Webview,
  fileProvider: FileTreeDataProvider,
  state: ExtensionState,
  checklistState: Record<string, boolean>
): string 
{
    const mediaFolderUri = vscode.Uri.joinPath(
      context.extensionUri,
      'media'
    );

    const image1Uri = webview.asWebviewUri(vscode.Uri.joinPath(mediaFolderUri, 'broken.png'));
    const image2Uri = webview.asWebviewUri(vscode.Uri.joinPath(mediaFolderUri, 'fixed.png'));

    const uri = vscode.Uri.joinPath(
      context.extensionUri,
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
            const className = i === currentIndex ? 'step-box step-active' : 'step-box';
            paginationHtml += `<button class="${className}" data-index="${i}" type="button">${i + 1}</button>`;
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
            context.extensionUri,
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

    let pointsOfInterestHtml = '';
    if (configData.codeFileToEdit) {
      const repoDirectory = fileProvider.getRepoPath() as string;
      const absolutePath = path.join(repoDirectory, configData.codeFileToEdit as string);
      const fileUri = vscode.Uri.file(absolutePath);
      const mapKey = fileUri.toString(); 

      const hintInfo = state.clickableHintLines.get(mapKey);

      if (hintInfo && hintInfo.persistent_lenses) {
          pointsOfInterestHtml = '<div><strong>Points of interest:</strong><ul>';
          hintInfo.persistent_lenses.forEach((pl: any) => {
              pointsOfInterestHtml += `
                  <li>
                      <a href="#" class="poi-link" data-line="${pl.id}">
                          ${pl.title}
                      </a>
                  </li>`;
          });
          pointsOfInterestHtml += '</ul></div>';
      }
    }

    const checklistHtml = renderChecklist(configData.checklist);

    htmlContent = htmlContent.replace('{{POINTS_OF_INTEREST}}', pointsOfInterestHtml);
    htmlContent = htmlContent.replace('{{HIGHLIGHT_LINES_BUTTON}}', highlightLinesHtml);
    htmlContent = htmlContent.replace('{{SHOW_SOLUTION_BUTTON}}', showSolutionHtml);
    htmlContent = htmlContent.replace('{{HAS_FILE_TO_OPEN}}', configData.codeFileToEdit ? 'true' : 'false');
    
    htmlContent = htmlContent.replace('{{CHECKLIST}}', checklistHtml);

    htmlContent = htmlContent.replace(
      '{{CHECKLIST_STATE}}',
      JSON.stringify(checklistState)
    );

    return htmlContent;
}

function renderChecklist(checklist?: ChecklistItem[]): string {
  if (!checklist || checklist.length === 0) {
    return '';
  }

  return `
    <div class="inline-drawer-checklist">
      ${checklist.map(item => `
        <label>
          <input type="checkbox" data-check-id="${item.id}">
          ${item.text}
        </label>
      `).join('')}
    </div>
  `;
}