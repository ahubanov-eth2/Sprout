import * as vscode from 'vscode';

export class LineProvider implements vscode.TreeDataProvider<LineItem> {
  private items = [
    new LineItem("Task 1"),
    new LineItem("Task 2"),
    new LineItem("Task 3"),
  ];

  getTreeItem(element: LineItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: LineItem): vscode.ProviderResult<LineItem[]> {
    return this.items;
  }
}

export class LineItem extends vscode.TreeItem {
  constructor(label: string) {
    super(label);
    this.iconPath = new vscode.ThemeIcon("book");
    this.command = {
      command: 'sprout.lineClicked',
      title: 'Select Task',
      arguments: [this]
    };
  }
}