import * as vscode from 'vscode';

export function getWorkspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('No workspace folder open.');
  }
  return folder.uri.fsPath;
}