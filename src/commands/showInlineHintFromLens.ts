import * as vscode from 'vscode';
import { PersistentLens } from '../types/types.js';
import { hintTexts } from '../providers/inlineHintContentProvider.js';

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
    }
  );
}