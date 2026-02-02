import * as vscode from 'vscode';

export const HINT_SCHEME = 'sprouthint';
export const hintTexts = new Map<string, string>();

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