import * as vscode from 'vscode';

export class TaskProvider implements vscode.TreeDataProvider<Section> {
  private sections : Section[] = [
    new Section("Introduction",
      [
        new Section("Welcome!", undefined, vscode.TreeItemCollapsibleState.None, "book"),
        new Section("Setup", undefined, vscode.TreeItemCollapsibleState.None, "code"),
      ],  vscode.TreeItemCollapsibleState.Collapsed,
      "file-directory"
    ),
    new Section("Theoretical Background",
      [
        new Section("Background 1", undefined, vscode.TreeItemCollapsibleState.None, "book"),
        new Section("Background 2", undefined, vscode.TreeItemCollapsibleState.None, "book"),
      ],  vscode.TreeItemCollapsibleState.Collapsed,
      "file-directory"
    ),
    new Section("Step-by-step Coding",
      [
        new Section("Step 1", undefined, vscode.TreeItemCollapsibleState.None, "code"),
        new Section("Step 2", undefined, vscode.TreeItemCollapsibleState.None, "code"),
      ],  
      vscode.TreeItemCollapsibleState.Collapsed,
      "file-directory"
    ),
    new Section("Debrief",
      [
        new Section("Debrief", undefined, vscode.TreeItemCollapsibleState.None, "book")
      ],  
      vscode.TreeItemCollapsibleState.Collapsed,
      "file-directory"
    ),
  ];

  private leaves: Section[] = [
      new Section("Welcome!", undefined, vscode.TreeItemCollapsibleState.None, "book"),
      new Section("Setup", undefined, vscode.TreeItemCollapsibleState.None, "code"),
      new Section("Background 1", undefined, vscode.TreeItemCollapsibleState.None, "book"),
      new Section("Background 2", undefined, vscode.TreeItemCollapsibleState.None, "book"),
      new Section("Step 1", undefined, vscode.TreeItemCollapsibleState.None, "code"),
      new Section("Step 2", undefined, vscode.TreeItemCollapsibleState.None, "code"),
      new Section("Debrief", undefined, vscode.TreeItemCollapsibleState.None, "book")
  ];

  private taskRoot : Section = new Section(
    "Title of task",
    this.sections,
    vscode.TreeItemCollapsibleState.Collapsed,
    "repo"
  );

  getTreeItem(element: Section): vscode.TreeItem {
    return element;
  }

  getChildren(element?: Section): vscode.ProviderResult<Section[]> {
    if (element) 
    {
      return element.children;
    } 
    else 
    {
      return [this.taskRoot];
    }
  }

  public findLeafByLabel(label: string): Section | undefined {
        const allLeaves = this.leaves;
        return allLeaves.find(leaf => leaf.label === label);
    }

  public findNextLeaf(currentItem: Section): Section | undefined {
    
    const allLeaves = this.leaves;
    const currentIndex = allLeaves.findIndex(leaf => leaf.label === currentItem.label);

    if (currentIndex === -1 || currentIndex >= allLeaves.length - 1) {
      return undefined;
    }

    return allLeaves[currentIndex + 1];
  }

  public findPrevLeaf(currentItem: Section): Section | undefined {
    
    const allLeaves = this.leaves;
    const currentIndex = allLeaves.findIndex(leaf => leaf.label === currentItem.label);

    if (currentIndex <= 0) {
      return undefined;
    }

    return allLeaves[currentIndex - 1];
  }
}

export class Section extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly children: Section[] | undefined,
    collapsibleState: vscode.TreeItemCollapsibleState,
    iconName: string
  ) {
    super(label, collapsibleState);
    this.iconPath = new vscode.ThemeIcon(iconName);

    if (collapsibleState === vscode.TreeItemCollapsibleState.None) {
      this.command = {
        command: 'sprout.lineClicked',
        title: 'Select Task',
        arguments: [this]
      };
    }
  }
}