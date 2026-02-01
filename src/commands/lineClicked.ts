import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { ExtensionState } from '../extension.js'
import { Section } from '../taskProvider.js';
import { ConfigData } from '../types/config.js';
import { TaskProvider } from '../taskProvider.js';
import { FileTreeDataProvider } from '../fileTreeDataProvider.js';
import { PersistentLens } from '../types/lens.js';

export function registerLineClickedCommand(
  context: vscode.ExtensionContext,

  leftProvider: TaskProvider,
  fileProvider: FileTreeDataProvider,
  treeView: vscode.TreeView<Section | vscode.TreeItem> | undefined,

  clickableHintLines: Map<string, { lines: [number, number][], hintText: string, label: string, isTemp: boolean, persistent_lenses: PersistentLens[]}>,
  codeLensChangeEmitter: vscode.EventEmitter<void>,

  state: ExtensionState,

  setCurrentItem: (item: Section) => void,

  getTempFileCopyUri: () => vscode.Uri | undefined,
  setTempFileCopyUri: (uri: vscode.Uri) => void,

  setActiveFileUri: (uri: vscode.Uri) => void,

  getCurrentPanel: () => vscode.WebviewPanel | undefined,
  setCurrentPanel: (panel: vscode.WebviewPanel | undefined) => void,

  updatePanelContent: (
    context: vscode.ExtensionContext,
    panel: vscode.WebviewPanel,
    item: Section,
    siblings: Section[],
    currentIndex: number,
    parentLabel: string,
    fileProvider: FileTreeDataProvider,
    clickableHintLines: Map<string, { lines: [number, number][], hintText: string, label: string, isTemp: boolean, persistent_lenses: PersistentLens[]}>
  ) => void,

  revealPanel: () => void
): vscode.Disposable {

  return vscode.commands.registerCommand('sprout.lineClicked', async (item: Section) => {

      const { siblings, currentIndex } = leftProvider.getLeafSiblings(item);
      const parent = leftProvider.findParent(leftProvider.getRoot(),item);
      const parentLabel = parent !== undefined ? parent.label : '';

      let configData: ConfigData = {};
      if (item.configFilePath) {
        const config = fs.readFileSync(item.configFilePath, 'utf8');
        configData = JSON.parse(config);
      }

      const repoDirectory = fileProvider.getRepoPath();
      let isCodeFileOpen = false;

      if (configData.codeFileToEdit) {
        if (repoDirectory) {
          const fileUri = vscode.Uri.file(path.join(repoDirectory, configData.codeFileToEdit));

          try {

            if (!getTempFileCopyUri()) {

              const tempFileName = `temp_${Date.now()}_${path.basename(fileUri.fsPath)}`;
              const tempFilePath = path.join(os.tmpdir(),tempFileName);
              const tsIgnoreHeader = '// @ts-nocheck\n';

              const originalContent = fs.readFileSync(fileUri.fsPath,'utf-8');
              const tempFileContent = tsIgnoreHeader + originalContent;

              const tempUri = vscode.Uri.file(tempFilePath);

              fs.writeFileSync(tempUri.fsPath,tempFileContent);
              setTempFileCopyUri(tempUri);
            }

            const doc = await vscode.workspace.openTextDocument(fileUri);

            await vscode.window.showTextDocument(doc,vscode.ViewColumn.One);

            setCurrentItem(item);
            setActiveFileUri(fileUri);
            console.log("Active File URI set to:", fileUri.toString());
            isCodeFileOpen = true;

            let terminal = vscode.window.terminals.find(t => t.name === 'Sprout Terminal');

            if (!terminal) {
              terminal = vscode.window.createTerminal({name: 'Sprout Terminal',cwd: repoDirectory});
            }
            terminal.show();

            const codeEditor =
              vscode.window.visibleTextEditors.find(
                editor =>
                  editor.viewColumn ===
                  vscode.ViewColumn.One
              );

            if (configData.persistentLenses && codeEditor) {

              const savedLenses =
                context.workspaceState.get<PersistentLens[]>(
                  `sprout:persistentLenses:${fileUri.toString()}`
                );

              let persistentLenses: PersistentLens[];

              if (savedLenses && savedLenses.length > 0) {
                  persistentLenses = savedLenses.map((l, index) => ({
                      id: l.id || `lens-${index}`,
                      title: String(l.title),
                      line: Number(l.line),
                      explanation: String(l.explanation)
                  }));
              } else {
                  persistentLenses = (configData.persistentLenses || []).map((l, index) => ({
                      id: `lens-${index}`,
                      title: String(l.title),
                      line: Number(l.line),
                      explanation: String(l.explanation)
                  }));
              }

              const hintInfo = {
                lines: [],
                hintText: '',
                label: item.label,
                isTemp: false,
                persistent_lenses: persistentLenses
              };

              clickableHintLines.set(
                codeEditor.document.uri.toString(),
                hintInfo
              );

              codeLensChangeEmitter.fire();
            }

          } catch (error) {
            vscode.window.showErrorMessage(
              `Could not open file: ${fileUri}`
            );
          }
        } else {
          vscode.window.showWarningMessage(
            'No cloned repository found to open the file.'
          );
        }
      } else {
        if (vscode.window.tabGroups.all.length > 1) {
          await vscode.commands.executeCommand(
            'workbench.action.closeOtherEditors'
          );
        }
      }

      await vscode.commands.executeCommand(
        'workbench.action.closePanel'
      );

      vscode.commands.executeCommand(
        'setContext',
        'sprout.hasClonedRepo',
        isCodeFileOpen
      );

      if (isCodeFileOpen) {

        const currentPanel = getCurrentPanel();
        if (currentPanel) { currentPanel.dispose(); }

        console.log("disposed of current panel")

        const panel =
          vscode.window.createWebviewPanel(
            'myRightPanel',
            'My Right Panel',
            {
              viewColumn: vscode.ViewColumn.Two,
              preserveFocus: true
            },
            {
              enableScripts: true,
              enableFindWidget: true
            }
          );

        setCurrentPanel(panel);

        panel.webview.onDidReceiveMessage(
          async message => {
            switch (message.command) {
              case 'goToIndex': 
                vscode.commands.executeCommand('sprout.goToItemByIndex', message.label, message.index);
                break;
              case 'nextItem':
                vscode.commands.executeCommand('sprout.goToNextItem',message.label);
                break;
              case 'scrollToLine':
                const lensId = message.line;
                if (!state.activeFileUri) return;

                const hintInfo = clickableHintLines.get(state.activeFileUri.toString());
                if (!hintInfo) return;

                const lens = hintInfo.persistent_lenses.find(l => l.id === lensId);
                if (!lens) return;

                const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === state.activeFileUri?.toString());
                if (editor) {
                    const range = new vscode.Range(lens.line - 1, 0, lens.line - 1, 0);
                    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                    editor.selection = new vscode.Selection(range.start, range.end);
                }
                break;
              case 'prevItem':
                vscode.commands.executeCommand('sprout.goToPrevItem',message.label);
                break;
              case 'showSolution':
                vscode.commands.executeCommand('sprout.showSolution',message.label);
                break;
              case 'getHintText':
                vscode.commands.executeCommand('sprout.showHintPopup',message.label);
                break;
              case 'toggleHighlight':
                vscode.commands.executeCommand('sprout.toggleHighlight',message.label);
                break;
              case 'saveChecklistState':
                context.workspaceState.update(
                    `sprout:checklist:${message.label}`,
                    message.state
                );
                break;  
            }
          },
          undefined,
          context.subscriptions
        );

        panel.onDidDispose(() => {
          setCurrentPanel(undefined);
        }, null, context.subscriptions);

      } else {
        revealPanel();
      }

      const panel = getCurrentPanel();
      if (panel) {
        updatePanelContent(
          context,
          panel,
          item,
          siblings,
          currentIndex,
          parentLabel,
          fileProvider,
          clickableHintLines
        );
      }

      if (treeView) {
        await treeView.reveal(item, {
          expand: true,
          focus: true,
          select: true
        });
      }

      let terminal =
        vscode.window.terminals.find(
          t => t.name === 'Sprout Terminal'
        );

      if (!terminal) {
        terminal = vscode.window.createTerminal({
          name: 'Sprout Terminal',
          cwd: repoDirectory
        });
      }
      terminal.show();
    }
  );
}
