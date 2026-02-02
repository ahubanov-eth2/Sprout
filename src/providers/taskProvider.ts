import * as vscode from 'vscode';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as fs from 'fs';

export class TaskProvider implements vscode.TreeDataProvider<Section | vscode.TreeItem> {
  private taskRoot: Section | undefined;

  private _onDidChangeTreeData: vscode.EventEmitter<Section | undefined | null | void> = new vscode.EventEmitter<Section | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<Section | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor(context: vscode.ExtensionContext) {
    this.loadData();
  }

  private async loadData() {

    const courseName = process.env.SPROUT_COURSE_NAME || '';

    const coursePath = vscode.Uri.joinPath(
      vscode.extensions.getExtension('ahubanov.sprout')!.extensionUri,
      'data',
      'structured-courses', 
      courseName
    );

    if (!fs.existsSync(coursePath.fsPath)) {
        vscode.window.showErrorMessage(`Attempted to launch a course but it was not found in extension data.`);
        return;
    }
    
    const rootMetaPath = path.join(coursePath.fsPath, 'course-info.yaml');
    const rootMetaContent = fs.readFileSync(rootMetaPath, 'utf8');
    const rootData = yaml.load(rootMetaContent) as any;

    const children = await Promise.all(
        rootData.content.map((childDir: string) => this.loadSection(path.join(coursePath.fsPath, childDir)))
    );

    this.taskRoot = new Section(
      rootData.title,
      children,
      vscode.TreeItemCollapsibleState.Collapsed,
      "repo"
    );

    this._onDidChangeTreeData.fire();
  }

  private async loadSection(sectionPath: string): Promise<Section> {
    const lessonInfoPath = path.join(sectionPath, 'lesson-info.yaml');
    const taskInfoPath = path.join(sectionPath, 'task-info.yaml');
    const configFilePath = path.join(sectionPath, 'config.json');

    let metaData: any;
    let children: Section[] | undefined;
    let collapsibleState = vscode.TreeItemCollapsibleState.None;

    if (fs.existsSync(lessonInfoPath)) {
        
        const lessonInfoContent = fs.readFileSync(lessonInfoPath, 'utf8');
        metaData = yaml.load(lessonInfoContent) as any;
        
        children = await Promise.all(
            metaData.content.map((childDir: string) => this.loadSection(path.join(sectionPath, childDir)))
        );
        collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

        return new Section(
          metaData.custom_name,
          children,
          collapsibleState,
          "file-directory"
        );
    } else if (fs.existsSync(taskInfoPath)) {
        
        const taskInfoContent = fs.readFileSync(taskInfoPath, 'utf8');
        metaData = yaml.load(taskInfoContent) as any;
      
        return new Section(
          metaData.custom_name,
          children,
          collapsibleState,
          "book",
          configFilePath && configFilePath
        );

    } else {
        throw new Error(`YAML info file not found for section at: ${sectionPath}`);
    }
  }

  getTreeItem(element: Section | vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: Section): vscode.ProviderResult<Section[] | vscode.TreeItem[]> {
    if (element) {
        return element.children;
    } else if (this.taskRoot) {
        return this.taskRoot.children;
    }
    return [];
}

  getRoot(): Section {
    return this.taskRoot as Section;
  }

  public findParent(node: Section, target: Section): Section | undefined {
    if (!node || !node.children) return undefined;

    if (node.children.some(child => child.label === target.label)) {
      return node;
    }

    for (const child of node.children) {
      const foundParent = this.findParent(child, target);
      if (foundParent) {
        return foundParent;
      }
    }
    return undefined;
  }

  private getAllLeaves(node: Section): Section[] {
    const leaves: Section[] = [];
    if (!node || !node.children) {
      if (node.collapsibleState === vscode.TreeItemCollapsibleState.None) {
          leaves.push(node);
      }
      return leaves;
    }

    const queue: Section[] = [...node.children];
    while (queue.length > 0) {
      const currentNode = queue.shift();
      if (currentNode) {
        if (currentNode.children && currentNode.children.length > 0) {
          currentNode.children.forEach(child => queue.push(child));
        } else {
          leaves.push(currentNode);
        }
      }
    }
    return leaves;
  }

  public findLeafByLabel(label: string): Section | undefined {
      const allLeaves = this.getAllLeaves(this.taskRoot as Section);;
      return allLeaves.find(leaf => leaf.label === label);
  }

  public getLeafSiblings(currentItem: Section): { siblings: Section[], currentIndex: number } {
    const parent = this.findParent(this.taskRoot as Section, currentItem);
    if (!parent || !parent.children) {
      return { siblings: [], currentIndex: -1 };
    }
    const siblings = parent.children.filter(child => !child.children || child.children.length === 0);
    const currentIndex = siblings.findIndex(s => s.label === currentItem.label);
    return { siblings, currentIndex };
  }

  public findNextLeaf(currentItem: Section): Section | undefined {
    
    const allLeaves = this.getAllLeaves(this.taskRoot as Section);
    const currentIndex = allLeaves.findIndex(leaf => leaf.label === currentItem.label);

    if (currentIndex === -1 || currentIndex >= allLeaves.length - 1) {
      return undefined;
    }

    return allLeaves[currentIndex + 1];
  }

  public findPrevLeaf(currentItem: Section): Section | undefined {
    
    const allLeaves = this.getAllLeaves(this.taskRoot as Section);
    const currentIndex = allLeaves.findIndex(leaf => leaf.label === currentItem.label);

    if (currentIndex <= 0) {
      return undefined;
    }

    return allLeaves[currentIndex - 1];
  }

  getParent(element: Section): Section | undefined {
    return this.findParent(this.taskRoot as Section, element);
  }
}

export class Section extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly children: Section[] | undefined,
    collapsibleState: vscode.TreeItemCollapsibleState,
    iconName: string,
    public readonly configFilePath?: string
  ) {
    super(label, collapsibleState);
    this.iconPath = new vscode.ThemeIcon(iconName);
    this.contextValue = children ? 'parent' : 'leaf'; 

    if (collapsibleState === vscode.TreeItemCollapsibleState.None) {
      this.command = {
        command: 'sprout.lineClicked',
        title: 'Select Task',
        arguments: [this]
      };
    }
  }
}