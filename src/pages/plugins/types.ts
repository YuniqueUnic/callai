export type ZipConflictMode = "rename" | "overwrite" | "fail" | "skip";

export type BuiltinCatalogItem = {
  id: string;
  name?: string;
  version?: string;
  update_available?: boolean;
  user_edited?: boolean;
};

/** Plugin zip import progress for the install modal. */
export type ImportPhase =
  | "idle"
  | "reading"
  | "parsing"
  | "installing"
  | "conflict"
  | "success"
  | "error";

export type ImportProgress = {
  phase: ImportPhase;
  fileName?: string;
  message?: string;
  pluginName?: string;
  pluginId?: string;
};
