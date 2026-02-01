import * as vscode from 'vscode';
import { PersistentLens } from '../types/types.js';
import { updatePanelContent } from '../content_utils/panel_utils.js';
import { FileTreeDataProvider } from '../fileTreeDataProvider.js';
import { TaskProvider } from '../taskProvider.js'
import { Section } from '../taskProvider.js';

type HintInfo = {
  lines: [number, number][];
  hintText: string;
  label: string;
  isTemp: boolean;
  persistent_lenses: PersistentLens[];
};

export function registerPersistentLensListener(
  clickableHintLines: Map<string, HintInfo>,
  codeLensChangeEmitter: vscode.EventEmitter<void>,
  context: vscode.ExtensionContext,

  leftProvider: TaskProvider,
  fileProvider: FileTreeDataProvider,

  getCurrentItem: () => Section | undefined,
  getCurrentPanel: () => vscode.WebviewPanel | undefined,

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
        const item = getCurrentItem();
        const { siblings, currentIndex } = leftProvider.getLeafSiblings(item as Section);
        const parent = leftProvider.findParent(leftProvider.getRoot(),item as Section);
        const parentLabel = parent !== undefined ? parent.label : '';
        const panel = getCurrentPanel();
        if (panel) {
          updatePanelContent(
            context,
            panel,
            item as Section,
            siblings,
            currentIndex,
            parentLabel,
            fileProvider,
            clickableHintLines
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
