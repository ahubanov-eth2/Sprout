import * as vscode from 'vscode';

export function registerTempFileMirrorListener(
  getTempFileUri: () => vscode.Uri | undefined
): vscode.Disposable {
  return vscode.workspace.onDidChangeTextDocument(event => {
    const tempFileCopyUri = getTempFileUri();
    if (!tempFileCopyUri) return;

    if (event.document.uri.toString() === tempFileCopyUri.toString()) {
      const edit = new vscode.WorkspaceEdit();

      edit.replace(
        event.document.uri,
        new vscode.Range(0, 0, event.document.lineCount, 0),
        event.document.getText()
      );

      vscode.workspace.applyEdit(edit);
    }
  });
}
