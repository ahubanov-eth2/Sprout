import * as vscode from 'vscode';
import { TaskProvider, Section } from '../taskProvider.js';

export function registerGoToItemByIndexCommand(
  leftProvider: TaskProvider
): vscode.Disposable {

  return vscode.commands.registerCommand(
    'sprout.goToItemByIndex',
        (label: string, index: number) => {

            console.log("In item by index")

            const leaf = leftProvider.findLeafByLabel(label);
            const { siblings } = leftProvider.getLeafSiblings(leaf as Section);

            const target = siblings[index];
            if (!target) {
                return;
            }

            vscode.commands.executeCommand('sprout.lineClicked', target);
        }
    );
}