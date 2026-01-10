import * as vscode from 'vscode';
import { PersistentLens } from '../types/lens.js';

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
  context: vscode.ExtensionContext
): vscode.Disposable {
  return vscode.workspace.onDidChangeTextDocument(event => {
    const uri = event.document.uri.toString();
    const hintInfo = clickableHintLines.get(uri);

    if (!hintInfo || !hintInfo.persistent_lenses) return;

    event.contentChanges.forEach(change => {
      const startLine = change.range.start.line + 1;
      const endLine = change.range.end.line + 1;

      hintInfo.persistent_lenses = hintInfo.persistent_lenses.filter(lens => {
        const line = Number(lens.line);
        return !(line >= startLine && line <= endLine);
      });

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
          hintInfo.persistent_lenses
        );

      }
    });

    codeLensChangeEmitter.fire();
  });
}
