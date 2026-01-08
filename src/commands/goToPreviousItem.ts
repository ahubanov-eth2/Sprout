import * as vscode from 'vscode';
import { TaskProvider } from '../taskProvider';

export function registerGoToPrevItemCommand(
  leftProvider: TaskProvider
): vscode.Disposable {

  return vscode.commands.registerCommand(
    'sprout.goToPrevItem',
    (label: string) => {
      const currentItem = leftProvider.findLeafByLabel(label);

      if (!currentItem) return;

      const prevItem = leftProvider.findPrevLeaf(currentItem);

      if (prevItem) {
        vscode.commands.executeCommand('sprout.lineClicked', prevItem);
      } else {
        vscode.window.showInformationMessage(
          'You are at the start of the list.'
        );
      }
    }
  );
}