import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { Section } from '../taskProvider.js';
import { ConfigData } from '../types/types.js';
import { TaskProvider } from '../taskProvider.js';
import { FileTreeDataProvider } from '../fileTreeDataProvider.js';
import { PersistentLens, ExtensionState } from '../types/types.js';
import { createWebviewPanel, registerWebviewMessageHandlers } from '../content_utils/panel_utils.js';

export function registerLineClickedCommand(
  context: vscode.ExtensionContext,

  leftProvider: TaskProvider,
  fileProvider: FileTreeDataProvider,
  treeView: vscode.TreeView<Section | vscode.TreeItem> | undefined,

  state: ExtensionState,

  updatePanelContent: (
    context: vscode.ExtensionContext,
    state: ExtensionState,
    panel: vscode.WebviewPanel,
    item: Section,
    siblings: Section[],
    currentIndex: number,
    parentLabel: string,
    fileProvider: FileTreeDataProvider
  ) => void

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

            if (!state.tempFileCopyUri) {

              const tempFileName = `temp_${Date.now()}_${path.basename(fileUri.fsPath)}`;
              const tempFilePath = path.join(os.tmpdir(),tempFileName);
              const tsIgnoreHeader = '// @ts-nocheck\n';

              const originalContent = fs.readFileSync(fileUri.fsPath,'utf-8');
              const tempFileContent = tsIgnoreHeader + originalContent;

              const tempUri = vscode.Uri.file(tempFilePath);

              fs.writeFileSync(tempUri.fsPath,tempFileContent);
              state.tempFileCopyUri = (tempUri);
            }

            const doc = await vscode.workspace.openTextDocument(fileUri);

            await vscode.window.showTextDocument(doc,vscode.ViewColumn.One);

            state.currentItem = item;
            state.activeFileUri = fileUri;
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

              // context.workspaceState.update(
              //   `sprout:persistentLenses:${fileUri.toString()}`,
              //   undefined
              // );

              const savedLenses =
                context.workspaceState.get<PersistentLens[]>(
                  `sprout:persistentLenses:${fileUri.toString()}`
                );

              let persistentLenses: PersistentLens[];

              if (savedLenses && savedLenses.length > 0) {
                  persistentLenses = savedLenses.map((l, index) => ({
                      id: l.id || `lens-${index}`,
                      title: l.title ?? configData.persistentLenses?.[index]?.title ?? `Lens ${index + 1}`,
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

              state.clickableHintLines.set(
                codeEditor.document.uri.toString(),
                hintInfo
              );

              state.codeLensChangeEmitter.fire();
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

      const currentPanel = state.currentPanel;
      if (isCodeFileOpen) {

        if (currentPanel) { 
          currentPanel.dispose(); 
        }
        
        const panel = createWebviewPanel(context, vscode.ViewColumn.Two);
        state.currentPanel = panel;
        registerWebviewMessageHandlers(context, state);

      } else if (currentPanel) {

        currentPanel.reveal(vscode.ViewColumn.One, true);

      } else {
        const panel = createWebviewPanel(context, vscode.ViewColumn.One, true);
        state.currentPanel = panel;

        registerWebviewMessageHandlers(context, state);
      }

      const panel = state.currentPanel;
      if (panel) {
        updatePanelContent(
          context,
          state,
          panel,
          item,
          siblings,
          currentIndex,
          parentLabel,
          fileProvider
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
