import * as vscode from 'vscode';

import { registerCommands }                                  from './commands/utils/commandRegistration.js';
import { registerEventListeners }                            from './listeners/utils/listenerRegistration.js';
import { registerViews, registerCodeLensProviderDisposable } from './providers/utils/providerRegistration.js';

import { inlineHintContentProvider } from './hints/inlineHintUtils.js';

const scheme = 'sprouthint';

function createState() {
  return { 
    clickableHintLines: new Map(), 
    codeLensChangeEmitter: new vscode.EventEmitter<void>() 
  };
}

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