import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { registerCommands } from './commands/utils/commandRegistration.js';
import { registerEventListeners } from './listeners/utils/listenerRegistration.js';

import { ExtensionState } from './types/types.js';

import { TaskProvider } from './taskProvider.js'
import { FileTreeDataProvider } from './fileTreeDataProvider.js';

import { inlineHintContentProvider } from './hints/inlineHintUtils.js';
import { getWorkspaceRoot } from './utils/workspace_utils.js';

const scheme = 'sprouthint';

//
export function activate(context: vscode.ExtensionContext) {

  const state = createState();
  const views = registerViews(context);
  registerCodeLensProviderDisposable(context, state);
  registerCommands(context, views, state);
  registerEventListeners(context, views, state);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(scheme, inlineHintContentProvider),
  );
}

export function deactivate() {}

function registerViews(context: vscode.ExtensionContext) {

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

function createState() {
  return { clickableHintLines: new Map(), codeLensChangeEmitter: new vscode.EventEmitter<void>() };
}