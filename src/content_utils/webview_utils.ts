import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { marked } from 'marked';

import { ChecklistItem } from '../types/config.js';
import { ConfigData } from '../types/config.js';
import { Section } from '../taskProvider.js'
import { PersistentLens } from '../types/lens.js';
import { FileTreeDataProvider } from '../fileTreeDataProvider.js';

export function getWebviewContent(
  item: any, 
  siblings: Section[], 
  currentIndex: number,
  parentLabel: string,
  webview: vscode.Webview,
  fileProvider: FileTreeDataProvider,
  clickableHintLines: Map<string, { lines: [number, number][], hintText: string, label: string, isTemp: boolean, persistent_lenses: PersistentLens[]}>,
  checklistState: Record<string, boolean>
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

    let pointsOfInterestHtml = '';
    if (configData.codeFileToEdit) {
      const repoDirectory = fileProvider.getRepoPath() as string;
      const absolutePath = path.join(repoDirectory, configData.codeFileToEdit as string);
      const fileUri = vscode.Uri.file(absolutePath);
      const mapKey = fileUri.toString(); 

      const hintInfo = clickableHintLines.get(mapKey);

      if (hintInfo && hintInfo.persistent_lenses) {
          pointsOfInterestHtml = '<div><strong>Points of interest:</strong><ul>';
          hintInfo.persistent_lenses.forEach((pl: any) => {
              pointsOfInterestHtml += `
                  <li>
                      <a href="#" class="poi-link" data-line="${pl.line}">
                          Line ${pl.line}
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