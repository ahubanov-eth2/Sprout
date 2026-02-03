import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { ExtensionState } from '../../types/types.js';
import { getWorkspaceRoot } from '../../utils/workspace_utils.js';

import { TaskProvider } from '../taskProvider.js';
import { FileTreeDataProvider } from '../fileTreeDataProvider.js';
import { HINT_SCHEME, inlineHintContentProvider } from '../inlineHintContentProvider.js';

export function registerViews(context: vscode.ExtensionContext) {

  // Registers the left-side course/task navigation tree view
  // managed by TaskProvider.
  const contentProvider = new TaskProvider(context);
  const contentTreeViewDisposable = vscode.window.createTreeView('leftView', { treeDataProvider: contentProvider });

  context.subscriptions.push(contentTreeViewDisposable);

  // Registers the file explorer tree view used to display
  // the cloned project repository contents.
  const codeFileProvider = new FileTreeDataProvider();
  const fileTreeDisposable = vscode.window.registerTreeDataProvider('clonedReposView', codeFileProvider);

  context.subscriptions.push(fileTreeDisposable);

  // Initializes the file tree root if the project repository exists
  // in the current workspace.
  const projectsDirectory = path.join( getWorkspaceRoot(), 'data', 'project-repository' );
  if (fs.existsSync(projectsDirectory)) {
      codeFileProvider.setRepoPath(projectsDirectory);
  }

  return { contentProvider, contentTreeViewDisposable, codeFileProvider };
}

// Registers the CodeLens provider that injects persistent
// "Learn more" lenses above annotated lines in source files.
// Lenses are driven by the mutable ExtensionState.
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

// Registers a virtual document content provider used to
// render inline hint text via the custom sprouthint URI scheme.
// This is the reason why the content in the "Learn more" hints displays
// in an inline .md file.
function registerInlineHintProviderDisposable(
  context: vscode.ExtensionContext
) {
  const hintContentProviderDisposable = vscode.workspace.registerTextDocumentContentProvider(HINT_SCHEME, inlineHintContentProvider);

  context.subscriptions.push(hintContentProviderDisposable);
}

// Registers all providers required for the inline code lenses
export function registerHintSystemProviders(
    context: vscode.ExtensionContext,
    state: ExtensionState
) {
    registerCodeLensProviderDisposable(context, state);
    registerInlineHintProviderDisposable(context);
}