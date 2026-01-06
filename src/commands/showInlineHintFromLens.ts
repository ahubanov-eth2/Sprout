import * as vscode from 'vscode';
import { PersistentLens } from '../types/lens';
import { showInlineHint } from '../hints/inlineHintUtils';

export function registerShowInlineHintFromLensCommand(
  clickableHintLines: Map<string, { lines: [number, number][], hintText: string, label: string, isTemp: boolean, persistent_lenses: PersistentLens[]}>
): vscode.Disposable {

  return vscode.commands.registerCommand(
    'sprout.showInlineHintFromLens',
    (uri: vscode.Uri, lens: PersistentLens) => {
      const editor = vscode.window.visibleTextEditors.find(
        e => e.document.uri.toString() === uri.toString()
      );

      const info = clickableHintLines.get(uri.toString());
      if (!editor || !info) return;

      const lineToShow = lens.line - 1;
      showInlineHint(editor, lineToShow, lens.explanation);

      // const rangeClicked = info.lines.find(([start, end]) => line >= start && line <= end);
      // if (rangeClicked) {
      //   showInlineHint(editor, rangeClicked, info.hintText);
      // }
    }
  );
}