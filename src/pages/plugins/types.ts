export type BuiltinCatalogItem = {
  id: string;
  name: string;
  version: string;
  description?: string;
  installed: boolean;
  installed_version: string | null;
  update_available: boolean;
  user_edited: boolean;
  blocked_by_user_edit: boolean;
};

export type ZipConflictMode = "rename" | "overwrite" | "fail" | "skip";
