import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { ExtensionState } from '../../types/types.js';
import { getWorkspaceRoot } from '../../utils/workspace_utils.js';

import { TaskProvider } from '../taskProvider.js';
import { FileTreeDataProvider } from '../fileTreeDataProvider.js';
import { HINT_SCHEME, inlineHintContentProvider } from '../inlineHintContentProvider.js';

export function registerViews(context: vscode.ExtensionContext) {

  //
  const contentProvider = new TaskProvider(context);
  const contentTreeViewDisposable = vscode.window.createTreeView('leftView', { treeDataProvider: contentProvider });

  context.subscriptions.push(contentTreeViewDisposable);

  //
  const codeFileProvider = new FileTreeDataProvider();
  const fileTreeDisposable = vscode.window.registerTreeDataProvider('clonedReposView', codeFileProvider);

  context.subscriptions.push(fileTreeDisposable);

  //
  const projectsDirectory = path.join( getWorkspaceRoot(), 'data', 'project-repository' );
  if (fs.existsSync(projectsDirectory)) {
      codeFileProvider.setRepoPath(projectsDirectory);
  }

  return { contentProvider, contentTreeViewDisposable, codeFileProvider };
}

//
function registerCodeLensProviderDisposable(
  context: vscode.ExtensionContext,
  state: ExtensionState
) {

  const codeLensProviderDisposable = vscode.languages.registerCodeLensProvider({ pattern: '**/*' }, {
    provideCodeLenses(document) {
      const hintInfo = state.clickableHintLines.get(document.uri.toString());
      const lenses: vscode.CodeLens[] = [];

      if (!hintInfo) return lenses;

      if (hintInfo.persistent_lenses) {
        for (const pl of hintInfo.persistent_lenses) {

          const lensArg = { line: Number(pl.line), explanation: String(pl.explanation) };
          const range = new vscode.Range(lensArg.line - 1, 0, lensArg.line - 1, 0);

          lenses.push(
            new vscode.CodeLens(range, {
              title: "💬 Learn more",
              command: 'sprout.showInlineHintFromLens',
              arguments: [document.uri, lensArg]
            })
          );
        }
      }

      return lenses;
    },
    onDidChangeCodeLenses: state.codeLensChangeEmitter.event
  });

  context.subscriptions.push(codeLensProviderDisposable);

}

//
function registerInlineHintProviderDisposable(
  context: vscode.ExtensionContext
) {
  const hintContentProviderDisposable = vscode.workspace.registerTextDocumentContentProvider(HINT_SCHEME, inlineHintContentProvider);

  context.subscriptions.push(hintContentProviderDisposable);
}

export function registerHintSystemProviders(
    context: vscode.ExtensionContext,
    state: ExtensionState
) {
    registerCodeLensProviderDisposable(context, state);
    registerInlineHintProviderDisposable(context);
}