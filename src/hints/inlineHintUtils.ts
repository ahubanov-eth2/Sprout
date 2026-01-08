import * as vscode from 'vscode';

const hintTexts = new Map<string, string>();

export function showInlineHint(editor: vscode.TextEditor, line: number, hintText: string) {
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

export const inlineHintContentProvider: vscode.TextDocumentContentProvider =
  new (class implements vscode.TextDocumentContentProvider {
    private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    provideTextDocumentContent(uri: vscode.Uri): string {
      const text =
        hintTexts.get(uri.path) ?? 'No hint available.';

      const formattedText = text
        .split(/\s+/)
        .reduce((acc, word, i) => {
          const sep = (i + 1) % 5 === 0 ? '\n' : ' ';
          return acc + word + sep;
        }, '');

      return formattedText;
    }
  })();