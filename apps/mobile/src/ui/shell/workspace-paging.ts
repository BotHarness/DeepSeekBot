type WorkspacePaging = {
  open(): void;
  close(): void;
};

let paging: WorkspacePaging | undefined;
let closeWhenShown = false;

export function bindWorkspacePaging(next: WorkspacePaging): () => void {
  paging = next;
  if (closeWhenShown) {
    closeWhenShown = false;
    next.close();
  }
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

export function closeWorkspacePageWhenShown(): void {
  if (paging) paging.close();
  else closeWhenShown = true;
}
