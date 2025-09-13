import * as vscode from 'vscode';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as fs from 'fs';

export class TaskProvider implements vscode.TreeDataProvider<Section | vscode.TreeItem> {
  private taskRoot: Section | undefined;
  private readonly extensionPath: string;

  private _onDidChangeTreeData: vscode.EventEmitter<Section | undefined | null | void> = new vscode.EventEmitter<Section | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<Section | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor(context: vscode.ExtensionContext) {
    this.extensionPath = context.extensionPath;
    this.loadData();
  }

  private async loadData() {
    const coursePath = path.join(this.extensionPath, 'courses', 'task1');
    
    const rootMetaPath = path.join(coursePath, 'course-info.yaml');
    const rootMetaContent = fs.readFileSync(rootMetaPath, 'utf8');
    const rootData = yaml.load(rootMetaContent) as any;

    const children = await Promise.all(
        rootData.content.map((childDir: string) => this.loadSection(path.join(coursePath, childDir)))
    );

    this.taskRoot = new Section(
      rootData.title,
      children,
      vscode.TreeItemCollapsibleState.Collapsed,
      "repo"
    );
  }

  private async loadSection(sectionPath: string): Promise<Section> {
    const lessonInfoPath = path.join(sectionPath, 'lesson-info.yaml');
    const taskInfoPath = path.join(sectionPath, 'task-info.yaml');
    const shellConfigPath = path.join(sectionPath, 'config.js');

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
    } else if (fs.existsSync(taskInfoPath)) {
        
        const taskInfoContent = fs.readFileSync(taskInfoPath, 'utf8');
        metaData = yaml.load(taskInfoContent) as any;

        return new Section(
          metaData.custom_name,
          children,
          collapsibleState,
          "book",
          path.join(sectionPath, "task.md"),
          metaData.children ? undefined : sectionPath,
          fs.existsSync(shellConfigPath) ? shellConfigPath : undefined
        );

    } else {
        throw new Error(`YAML info file not found for section at: ${sectionPath}`);
    }

    return new Section(
      metaData.custom_name,
      children,
      collapsibleState,
      "file-directory",
      metaData.file,
      metaData.children ? undefined : sectionPath
    );
  }

  getTreeItem(element: Section | vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: Section): vscode.ProviderResult<Section[] | vscode.TreeItem[]> {
      if (element) {
          const currentPath = element.clonePath;

          if (currentPath) {
              const children = fs.readdirSync(currentPath, { withFileTypes: true })
                  .filter(dirent => !dirent.name.startsWith('.') && dirent.name !== 'node_modules')
                  .map(dirent => {
                      const childPath = path.join(currentPath, dirent.name);
                      const isDirectory = dirent.isDirectory();
                      
                      if (isDirectory) {
                          return new Section(
                              dirent.name,
                              [],
                              vscode.TreeItemCollapsibleState.Collapsed,
                              "folder",
                              undefined,
                              childPath
                          );
                      } else {
                          const fileItem = new vscode.TreeItem(dirent.name, vscode.TreeItemCollapsibleState.None);
                          fileItem.iconPath = new vscode.ThemeIcon("file");
                          fileItem.resourceUri = vscode.Uri.file(childPath);
                          fileItem.command = {
                              command: 'sprout.openFile',
                              title: 'Open File',
                              arguments: [fileItem.resourceUri]
                          };
                          return fileItem;
                      }
                  });
              return children;
          } else {
              return element.children;
          }
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

  public async addClonedRepo(repoName: string, destination: string) {
        if (this.taskRoot && this.taskRoot.children) {
            const newRepoSection = new Section(
                repoName,
                undefined, 
                vscode.TreeItemCollapsibleState.Collapsed,
                "repo",
                undefined,
                destination,
                undefined,
                destination
            );

            this.taskRoot.children.push(newRepoSection);
            this._onDidChangeTreeData.fire();
        }
    }
}

export class Section extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly children: Section[] | undefined,
    collapsibleState: vscode.TreeItemCollapsibleState,
    iconName: string,
    public readonly filePath? : string,
    public readonly folderPath?: string,
    public readonly shellConfigPath?: string,
    public readonly clonePath?: string
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