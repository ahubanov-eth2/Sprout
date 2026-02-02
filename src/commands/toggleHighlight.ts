import * as vscode from 'vscode';
import * as fs from 'fs';
import { TaskProvider } from '../providers/taskProvider.js';
import { ConfigData } from '../types/types.js';

export function registerToggleHighlightCommand(
  leftProvider: TaskProvider,
  getTempFileCopyUri: () => vscode.Uri | undefined
): vscode.Disposable {

  return vscode.commands.registerCommand(
    'sprout.toggleHighlight',
    async (label: string) => {

      const tempFileCopyUri = getTempFileCopyUri();
      if (!tempFileCopyUri) {
        vscode.window.showWarningMessage('No active code editor found.');
        return;
      }

      const currentItem = leftProvider.findLeafByLabel(label);
      if (!currentItem) return;

      let configData: ConfigData = {};
      if (currentItem.configFilePath) {
        const config = fs.readFileSync(currentItem.configFilePath, 'utf8');
        configData = JSON.parse(config);
      }

      const hintText = configData.hint || '';
      const hintUri = vscode.Uri.parse(
        `sprout-hint:Hint for ${label}.md?${encodeURIComponent(
          hintText
        )}`
      );
      const hintDoc = await vscode.workspace.openTextDocument(hintUri);

      await vscode.window.showTextDocument(hintDoc, {
        viewColumn: vscode.ViewColumn.Two,
        preserveFocus: true,
        preview: false
      });

      // const tempDoc = await vscode.workspace.openTextDocument(tempFileCopyUri);
      // const codeEditor = await vscode.window.showTextDocument(tempDoc, {
      //   viewColumn: vscode.ViewColumn.One,
      //   preserveFocus: false,
      //   preview: false
      // });

      // const lineOffset = 1;
      // const lineRanges = configData.hintLineRangesCurrent as [number, number][];
      // const linesToHighlight = (lineRanges || []).map(([startLine, endLine]) => ({
      //   range: new vscode.Range(
      //     startLine - 1,
      //     0,
      //     endLine,
      //     1000000
      //   ) // the -1 is because of the warning message that is to be added
      // }));

      // const firstHighlightedStart = (lineRanges[0][0] - 1);
      // const headerRange = new vscode.Range(
      //   new vscode.Position(firstHighlightedStart, 0),
      //   new vscode.Position(firstHighlightedStart, 0)
      // );

      // codeEditor.setDecorations(
      //   warningHeaderDecorationType,
      //   [headerRange]
      // );
      // codeEditor.setDecorations(
      //   hintDecorationType,
      //   linesToHighlight
      // );

      // if (lineRanges && lineRanges.length > 0) {
      //   const [firstStart] = lineRanges[0];
      //   const targetPos = new vscode.Position(
      //     firstStart - 1 + lineOffset,
      //     0
      //   );
      //   const targetRange = new vscode.Range(
      //     targetPos,
      //     targetPos
      //   );

      //   codeEditor.revealRange(
      //     targetRange,
      //     vscode.TextEditorRevealType.AtTop
      //   );
      //   codeEditor.selection =
      //     new vscode.Selection(targetPos, targetPos);
      // }
    }
  );
}