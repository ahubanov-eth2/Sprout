import * as vscode from 'vscode';

const diffHintDecoration = vscode.window.createTextEditorDecorationType({
  before: {
    contentText: '💡',
    margin: '0 0 0 0rem'
  },
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
});

function makeHover(explanation: string, uri: vscode.Uri, line: number) {
  const md = new vscode.MarkdownString(
    `**Why make this change?**\n\n` +
    `${explanation}`
  );

  md.isTrusted = true;
  return md;
}


export function decorateDiffEditor(
  editor: vscode.TextEditor,
  hints: { line: number; explanation: string }[]
) {
  const decorations: vscode.DecorationOptions[] = hints.map(hint => {
    const line = editor.document.lineAt(hint.line);

    return {
      range: new vscode.Range(hint.line, 0, hint.line, line.text.length),
      hoverMessage: makeHover(hint.explanation, editor.document.uri, hint.line)
    };
  });

  editor.setDecorations(diffHintDecoration, decorations);
}