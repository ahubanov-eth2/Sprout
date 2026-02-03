import * as vscode from 'vscode';
import { Section } from "../providers/taskProvider";

/**
 * Internal representation of an inline code lens.
 */
export type PersistentLens = {
    id: string,
    title: string,
    line: number;
    explanation: string; 
};

/**
 * A single checklist entry shown in the UI.
 */
export type ChecklistItem = {
  id: string;
  text: string;
};

/**
 * Central mutable state used across the extension.
 */
export type ExtensionState = {
  /** Currently focused section/page/item of the extension, if any */
  currentItem? : Section;

  /** Active webview panel owned by the extension */
  currentPanel?: vscode.WebviewPanel;

  /** URI of the currently active source file */
  activeFileUri?: vscode.Uri;

  /** 
   *  (This comment may be inaccurate.)
   *  DEPRECATED: 
   *  URI of a copy of the active file before the user starts making changes.
   *  This is used for the solution diff if the diff does not compare branches on a forked repo.
   */
  tempFileCopyUri?: vscode.Uri;

  /** 
   *  For all intents and purposes, this is simply a container for all the PersistentLens objects that need to kept track of. 
   *  It does not necessarily need to be a map or contain so many values per entry.
   */
  clickableHintLines: Map<string, { lines: [number, number][], hintText: string, label: string, isTemp: boolean, persistent_lenses: PersistentLens[]}>;

  /** Emits events for the click of a code lens or for the appearance of the code lenses in the active code file */
  codeLensChangeEmitter: vscode.EventEmitter<void>;
};

/**
 * Configuration data loaded for each step of a task.
 * Must be read from a config.json file in the subfolder of the corresponding task.
 */
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