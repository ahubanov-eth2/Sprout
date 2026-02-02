import * as vscode from 'vscode';
import * as fs from 'fs';
import { ConfigData } from '../types/types.js';
import { TaskProvider } from '../providers/taskProvider.js';

export function registerShowHintPopupCommand(
  leftProvider: TaskProvider,
  getCurrentPanel: () => vscode.WebviewPanel | undefined
): vscode.Disposable {

  return vscode.commands.registerCommand(
    'sprout.showHintPopup',
    async (label: string) => {
      const currentItem = leftProvider.findLeafByLabel(label);

      let configData: ConfigData = {};
      if (currentItem?.configFilePath) {
        const config = fs.readFileSync(currentItem.configFilePath, 'utf8');
        configData = JSON.parse(config);
      }

      const hintText = configData.hint;
      if (!hintText) {
        vscode.window.showWarningMessage(`No hint file found for section: ${label}`);
        return;
      }

      try {
        const panel = getCurrentPanel();
        if (panel) {
          panel.webview.postMessage({
            command: 'displayHintText',
            text: hintText
          });
        }
      } catch (e) {
        vscode.window.showErrorMessage(
          `Error reading hint file: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      }
    }
  );
}