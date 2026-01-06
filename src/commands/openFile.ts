import * as vscode from 'vscode';

export function registerOpenFileCommand(): vscode.Disposable {

  return vscode.commands.registerCommand('sprout.openFile', (uri: vscode.Uri) => {
      vscode.window.showTextDocument(uri);
  })
}