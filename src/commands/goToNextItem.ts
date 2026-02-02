import * as vscode from 'vscode';
import { TaskProvider } from '../providers/taskProvider.js';

export function registerGoToNextItemCommand(
  leftProvider: TaskProvider
): vscode.Disposable {

  return vscode.commands.registerCommand(
    'sprout.goToNextItem',
    (label: string) => {
      const currentItem = leftProvider.findLeafByLabel(label);

      if (!currentItem) {
        return;
      }

      const nextItem = leftProvider.findNextLeaf(currentItem);

      if (nextItem) {
        vscode.commands.executeCommand('sprout.lineClicked', nextItem);
      } else {
        vscode.window.showInformationMessage(
          'You are at the end of the list.'
        );
      }
    }
  );
}