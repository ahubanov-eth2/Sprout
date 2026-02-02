import * as vscode from 'vscode';

import { registerCommands }           from './commands/utils/commandRegistration.js';
import { registerEventListeners }     from './listeners/utils/listenerRegistration.js';
import { registerViews, 
         registerHintSystemProviders} from './providers/utils/providerRegistration.js';

//
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

  registerHintSystemProviders(context, state);
  registerCommands(context, views, state);
  registerEventListeners(context, views, state);

  const hintSchema = vscode.workspace.registerTextDocumentContentProvider('sprout-hint', {
      provideTextDocumentContent(uri) {
          return decodeURIComponent(uri.query);
      }
  });

  context.subscriptions.push(hintSchema);
}

//
export function deactivate() {}