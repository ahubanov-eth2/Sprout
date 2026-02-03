import * as vscode from 'vscode';

import { ExtensionState } from './types/types.js';

import { registerCommands }           from './commands/utils/commandRegistration.js';
import { registerEventListeners }     from './listeners/utils/listenerRegistration.js';
import { registerViews, 
         registerHintSystemProviders} from './providers/utils/providerRegistration.js';

/**
 * Creates and initializes the extension's internal runtime state.
 *
 * Only fields that must exist at startup are initialized here.
 * Other state fields are populated lazily as the user interacts
 * with the extension.
 */
function createState() : ExtensionState {
  return { 
    clickableHintLines: new Map(), 
    codeLensChangeEmitter: new vscode.EventEmitter<void>() 
  };
}

/**
 * Entry point for the extension.
 *
 * Called by VS Code when the extension is first activated.
 * Responsible for initializing state and registering various components
 */
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

/**
 * Cleanup logic for the extension.
 *
 * Currently unused, but defined for completeness and
 * future teardown logic if needed.
 */
export function deactivate() {}