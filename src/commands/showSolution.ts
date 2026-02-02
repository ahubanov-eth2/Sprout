import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';

import { TaskProvider } from '../providers/taskProvider.js';
import { FileTreeDataProvider } from '../providers/fileTreeDataProvider.js';
import { ConfigData } from '../types/types.js';
import { decorateDiffEditor } from '../content_utils/solution_diff_utils.js';

export function registerShowSolutionCommand(
  leftProvider: TaskProvider,
  fileProvider: FileTreeDataProvider,
  getTempFileCopyUri: () => vscode.Uri | undefined,
  getActiveFileUri: () => vscode.Uri | undefined,
): vscode.Disposable {

  return vscode.commands.registerCommand('sprout.showSolution', async (label: string) => {
      const tempFileCopyUri = getTempFileCopyUri();
      const activeFileUri = getActiveFileUri();

      if (!tempFileCopyUri || !activeFileUri) {
        vscode.window.showWarningMessage('No active code editor found.');
        return;
      }

      const currentItem = leftProvider.findLeafByLabel(label);

      let configData: ConfigData = {};
      if (currentItem && currentItem.configFilePath) {
        const config = fs.readFileSync(currentItem.configFilePath, 'utf8');
        configData = JSON.parse(config);
      }

      const diffPoints = configData.diffPoints ?? [];

      const previousCommit = configData.previousStepCommit ?? process.env.PARENT_COMMIT;
      const solutionCommit = configData.solutionCommit ?? process.env.COMMIT;

      const repoPath = fileProvider.getRepoPath() as string;
      const relativeFilePath = path.relative(repoPath, activeFileUri.fsPath);

      const previousStepSolutionCommand = `git --git-dir=${path.join(repoPath,'.git')} show ${previousCommit}:${relativeFilePath}`;
      const solutionCommand = `git --git-dir=${path.join(repoPath,'.git')} show ${solutionCommit}:${relativeFilePath}`;

      try {
        const solutionResult = await new Promise<string>((resolve, reject) => {
            exec(solutionCommand, { cwd: repoPath }, (err, stdout, stderr) => {
                if (err) {
                    reject(new Error(`Failed to get solution content: ${stderr}`));
                }
                resolve(stdout);
            });
        });

        const previousSolutionResult = await new Promise<string>((resolve, reject) => {
            exec(previousStepSolutionCommand, { cwd: repoPath }, (err, stdout, stderr) => {
                if (err) {
                    reject(new Error(`Failed to get solution content: ${stderr}`));
                }
                resolve(stdout);
            });
        });

        const previousSolutionTempFilePath = path.join(
          os.tmpdir(),
          `current-temp-${path.basename(relativeFilePath)}`
        );

        const solutionTempFilePath = path.join(
          os.tmpdir(),
          `solution-temp-${path.basename(relativeFilePath)}`
        );

        const prevSolutionFileUri = vscode.Uri.file(previousSolutionTempFilePath);
        const solutionTempFileUri = vscode.Uri.file(solutionTempFilePath);

        fs.writeFileSync(previousSolutionTempFilePath, previousSolutionResult);
        fs.writeFileSync(solutionTempFilePath, solutionResult);

        const title = `Solution for current step (${path.basename(relativeFilePath)})`;
        await vscode.commands.executeCommand(
          'vscode.diff',
          prevSolutionFileUri,
          solutionTempFileUri,
          title,
          { viewColumn: vscode.ViewColumn.Active, preview: false }
        );

        setTimeout(() => {
          for (const editor of vscode.window.visibleTextEditors) {
            if (editor.document.uri.toString() === solutionTempFileUri.toString()) {
              if (!diffPoints.length) return;

              decorateDiffEditor(
                editor,
                diffPoints.map(diff_point => ({
                  line: diff_point.line - 1,
                  explanation: diff_point.explanation
                }))
              );
            }
          }
        }, 100);

      } catch (e: any) {
        vscode.window.showErrorMessage(e.message);
        return;
      }
    }
  );
}