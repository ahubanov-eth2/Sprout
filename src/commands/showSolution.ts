import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';

import { TaskProvider } from '../taskProvider';
import { FileTreeDataProvider } from '../fileTreeDataProvider';
import { ConfigData } from '../types/config';

export function registerShowSolutionCommand(
  leftProvider: TaskProvider,
  fileProvider: FileTreeDataProvider,
  getTempFileCopyUri: () => vscode.Uri | undefined,
  getActiveFileUri: () => vscode.Uri | undefined
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
        const config = fs.readFileSync(
          currentItem.configFilePath,
          'utf8'
        );
        configData = JSON.parse(config);
      }

      // const lineRangesCurrent =
      //   configData.diffLineRangesCurrent as [number, number][];
      // const lineRangesSolution =
      //   configData.hintLineRangesSolution as [number, number][];

      // const startLineCurrent = lineRangesCurrent[0][0];
      // const endLineCurrent =
      //   lineRangesCurrent[lineRangesCurrent.length - 1][1];

      // const startLineSolution = lineRangesSolution[0][0];
      // const endLineSolution =
      //   lineRangesSolution[lineRangesSolution.length - 1][1];

      const repoPath = fileProvider.getRepoPath() as string;

      const relativeFilePath = path.relative(
        repoPath,
        activeFileUri.fsPath
      );

      const solutionCommand = `git --git-dir=${path.join(repoPath,'.git')} show ${process.env.COMMIT}:${relativeFilePath}`;

      // let solutionContent: string;
      try {
        const solutionResult = await new Promise<string>((resolve, reject) => {
            exec(solutionCommand, { cwd: repoPath }, (err, stdout, stderr) => {
                if (err) {
                    reject(new Error(`Failed to get solution content: ${stderr}`));
                }
                resolve(stdout);
            });
        });

        // solutionContent = solutionResult;
        const currentContent = fs.readFileSync(tempFileCopyUri.fsPath,'utf8');

        // let currentLines: string[] = [];
        // if (hasCurrentRange) {
        //   currentLines = currentContent
        //     .split('\n')
        //     .slice(startLineCurrent - 1, endLineCurrent);
        // } else {
        //   currentLines = [];
        // }

        // const solutionLines = solutionContent
        //   .split('\n')
        //   .slice(startLineSolution - 1, endLineSolution);

        const currentTempFilePath = path.join(
          os.tmpdir(),
          `current-temp-${path.basename(relativeFilePath)}`
        );

        const solutionTempFilePath = path.join(
          os.tmpdir(),
          `solution-temp-${path.basename(relativeFilePath)}`
        );

        const currentTempFileUri = vscode.Uri.file(currentTempFilePath);
        const solutionTempFileUri =vscode.Uri.file(solutionTempFilePath);

        // fs.writeFileSync(
        //   currentTempFilePath,
        //   currentLines.join('\n')
        // );
        // fs.writeFileSync(
        //   solutionTempFilePath,
        //   solutionLines.join('\n')
        // );

        fs.writeFileSync(currentTempFilePath,currentContent);
        fs.writeFileSync(solutionTempFilePath,solutionResult);

        const title = `Original vs Solution (${path.basename(relativeFilePath)})`;
        await vscode.commands.executeCommand(
          'vscode.diff',
          currentTempFileUri,
          solutionTempFileUri,
          title,
          { viewColumn: vscode.ViewColumn.Active, preview: false }
        );

      } catch (e: any) {
        vscode.window.showErrorMessage(e.message);
        return;
      }
    }
  );
}