import * as vscode from 'vscode';
import { ExtensionState, PersistentLens } from '../types/types.js';
import { updatePanelContent } from '../content_utils/panel_utils.js';
import { FileTreeDataProvider } from '../providers/fileTreeDataProvider.js';
import { TaskProvider } from '../providers/taskProvider.js'
import { Section } from '../providers/taskProvider.js';

type HintInfo = {
  lines: [number, number][];
  hintText: string;
  label: string;
  isTemp: boolean;
  persistent_lenses: PersistentLens[];
};

/** 
 * Listens for text edits in code files or docs that contain inline hint lenses.
 * Removes lenses that are invalidated by edits, shifts remaining lenses
 * to stay aligned with line changes, persists updated lens state, 
 * and updates the active panel UI when needed. 
 */ 
export function registerPersistentLensListener(
  clickableHintLines: Map<string, HintInfo>,
  codeLensChangeEmitter: vscode.EventEmitter<void>,
  context: vscode.ExtensionContext,
  state: ExtensionState,

  leftProvider: TaskProvider,
  fileProvider: FileTreeDataProvider

): vscode.Disposable {
  return vscode.workspace.onDidChangeTextDocument(event => {
    const uri = event.document.uri.toString();
    const hintInfo = clickableHintLines.get(uri);

    if (!hintInfo || !hintInfo.persistent_lenses) return;

    event.contentChanges.forEach(change => {
      const startLine = change.range.start.line + 1;
      const endLine = change.range.end.line + 1;

      const beforeCount = hintInfo.persistent_lenses.length;

      hintInfo.persistent_lenses = hintInfo.persistent_lenses.filter(lens => {
        const line = Number(lens.line);
        return !(line >= startLine && line <= endLine);
      });

      const afterCount = hintInfo.persistent_lenses.length;
      if (beforeCount != afterCount) {
        const item = state.currentItem;
        const { siblings, currentIndex } = leftProvider.getLeafSiblings(item as Section);
        const parent = leftProvider.findParent(leftProvider.getRoot(),item as Section);
        const parentLabel = parent !== undefined ? parent.label : '';
        const panel = state.currentPanel;
        if (panel) {
          updatePanelContent(
            context,
            state,
            panel,
            item as Section,
            siblings,
            currentIndex,
            parentLabel,
            fileProvider
          );
        }
      }

      const linesAdded = change.text.split('\n').length - 1;
      const linesRemoved = endLine - startLine;
      const lineDelta = linesAdded - linesRemoved;

      if (lineDelta !== 0) {
        hintInfo.persistent_lenses = hintInfo.persistent_lenses.map(lens => {
          if (Number(lens.line) > startLine) {
            return { ...lens, line: Number(lens.line) + lineDelta };
          }
          return lens;
        });

        context.workspaceState.update(
          `sprout:persistentLenses:${uri}`,
          hintInfo.persistent_lenses.map(l => ({
            id: l.id,
            title: l.title,          
            line: l.line,
            explanation: l.explanation
          }))
        );

      }
    });

    codeLensChangeEmitter.fire();
  });
}
