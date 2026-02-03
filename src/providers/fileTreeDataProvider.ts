import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * TreeDataProvider that manages the cloned project repository that is cloned into the task and in which the user solves the task
 * It presents a filesystem directory where this repo is cloned as a navigable tree view.
 *
 * Functionalities:
 * - Displays folders and files rooted at a configurable repository path.
 * - Lazily reads the filesystem on expansion of the panel where it is contained.
 * - Attaches the "open file" command to leaf nodes so the user can interact with files of this repo.
 */
export class FileTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private repoPath: string | undefined;

    constructor() {}

    setRepoPath(repoPath: string) {
        this.repoPath = repoPath;
        this._onDidChangeTreeData.fire();
    }

    getRepoPath(): string | undefined {
        return this.repoPath;
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!this.repoPath) {
            return [];
        }

        const currentPath = element ? (element.resourceUri as vscode.Uri).fsPath : this.repoPath;
        const items: vscode.TreeItem[] = [];

        try {
            const dirents = await fs.promises.readdir(currentPath, { withFileTypes: true });

            for (const dirent of dirents) {
                if (dirent.name.startsWith('.') || dirent.name === 'node_modules') {
                    continue;
                }

                const childPath = path.join(currentPath, dirent.name);
                const resourceUri = vscode.Uri.file(childPath);

                if (dirent.isDirectory()) {
                    const treeItem = new vscode.TreeItem(dirent.name, vscode.TreeItemCollapsibleState.Collapsed);
                    treeItem.resourceUri = resourceUri;
                    treeItem.iconPath = new vscode.ThemeIcon('folder');
                    items.push(treeItem);
                } else {
                    const treeItem = new vscode.TreeItem(dirent.name, vscode.TreeItemCollapsibleState.None);
                    treeItem.resourceUri = resourceUri;
                    treeItem.iconPath = new vscode.ThemeIcon('file');
                    treeItem.command = {
                        command: 'sprout.openFile',
                        title: 'Open File',
                        arguments: [resourceUri]
                    };
                    items.push(treeItem);
                }
            }
        } catch (error) {
            console.error(`Error reading directory: ${currentPath}`, error);
        }

        return items;
    }
}