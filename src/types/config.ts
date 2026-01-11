import { PersistentLens } from './lens';

export interface ConfigData {
  setupData? : any,
  taskDescriptionFile? : string,
  previousStepCommit? : string,
  solutionCommit? : string,
  codeFileToEdit? : string,
  hintLineRangesCurrent? : Array<[number, number]>,
  hintLineRangesSolution? : Array<[number, number]>,
  diffLineRangesCurrent? : Array<[number, number]>,
  hint? : string
  persistentLenses? : PersistentLens[]
}