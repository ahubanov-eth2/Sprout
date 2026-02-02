import * as vscode from 'vscode';
import { Section } from "../taskProvider";

export type PersistentLens = {
    id: string,
    title: string,
    line: number;
    explanation: string; 
};

export type ChecklistItem = {
  id: string;
  text: string;
};

export type ExtensionState = {
  currentItem? : Section;
  currentPanel?: vscode.WebviewPanel;
  activeFileUri?: vscode.Uri;
  tempFileCopyUri?: vscode.Uri;
  clickableHintLines: Map<string, { lines: [number, number][], hintText: string, label: string, isTemp: boolean, persistent_lenses: PersistentLens[]}>;
  codeLensChangeEmitter: vscode.EventEmitter<void>;
};

export interface ConfigData {
  setupData? : any,
  taskDescriptionFile? : string,
  previousStepCommit? : string,
  solutionCommit? : string,
  codeFileToEdit? : string,
  hintLineRangesCurrent? : Array<[number, number]>,
  hintLineRangesSolution? : Array<[number, number]>,
  diffLineRangesCurrent? : Array<[number, number]>,
  hint? : string,
  persistentLenses? : PersistentLens[],
  diffPoints? : PersistentLens[],
  checklist?: ChecklistItem[]
}