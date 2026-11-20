export function launcherControl(input: {
  launchId: string;
  owned(rootPid: number): void;
  closed(): void;
  rejected(): void;
}): (chunk: string) => void {
  let buffer = '';
  let rootPid: number | undefined;
  let closed = false;
  let rejected = false;
  const fail = () => {
    if (rejected) return;
    rejected = true;
    buffer = '';
    input.rejected();
  };
  return (chunk) => {
    if (rejected) return;
    buffer += chunk;
    if (Buffer.byteLength(buffer) > 4096) return fail();
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        return fail();
      }
      if (
        typeof value !== 'object' ||
        value === null ||
        !('launchId' in value) ||
        value.launchId !== input.launchId ||
        !('version' in value) ||
        value.version !== 1 ||
        !('event' in value)
      )
        return fail();
      if (
        value.event === 'tree-owned' &&
        'rootPid' in value &&
        typeof value.rootPid === 'number' &&
        Number.isSafeInteger(value.rootPid) &&
        value.rootPid > 0
      ) {
        if (closed) return fail();
        if (rootPid !== undefined) {
          if (rootPid !== value.rootPid) return fail();
          continue;
        }
        rootPid = value.rootPid;
        input.owned(rootPid);
      } else if (
        value.event === 'tree-closed' &&
        'activeProcesses' in value &&
        value.activeProcesses === 0 &&
        rootPid !== undefined
      ) {
        if (!closed) {
          closed = true;
          input.closed();
        }
      } else return fail();
    }
  };
}
