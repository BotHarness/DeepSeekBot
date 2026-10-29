type WorkspacePaging = {
  open(): void;
  close(): void;
};

let paging: WorkspacePaging | undefined;

export function bindWorkspacePaging(next: WorkspacePaging): () => void {
  paging = next;
  return () => {
    if (paging === next) paging = undefined;
  };
}

export function openWorkspacePage(): boolean {
  if (!paging) return false;
  paging.open();
  return true;
}

export function closeWorkspacePage(): boolean {
  if (!paging) return false;
  paging.close();
  return true;
}
