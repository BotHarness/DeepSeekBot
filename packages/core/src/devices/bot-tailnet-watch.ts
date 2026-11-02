import { spawn, type ChildProcess } from 'node:child_process';

export interface TailnetChange {
  removedNodeIds: string[];
  selfNodeId?: string | null;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function stableId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/u.test(value) ? value : undefined;
}

export function createTailnetNotificationReader(changed: (change: TailnetChange) => void) {
  const peers = new Map<number, string>();
  const remember = (node: unknown, initial: boolean) => {
    const item = record(node);
    const id = initial ? item.NodeID : item.ID;
    const stable = stableId(initial ? item.ID : item.StableID);
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || stable === undefined)
      throw new Error('tailnet-watch-invalid');
    peers.set(id, stable);
    if (peers.size > 8192) throw new Error('tailnet-watch-limit');
  };
  const notify = (value: unknown) => {
    const event = record(value);
    const removedNodeIds: string[] = [];
    let selfNodeId: string | null | undefined;
    if (event.InitialStatus !== undefined) {
      const initial = record(event.InitialStatus);
      peers.clear();
      for (const peer of Object.values(record(initial.Peer))) remember(peer, true);
      selfNodeId = initial.BackendState === 'NeedsLogin' ? null : stableId(record(initial.Self).ID);
    }
    if (Array.isArray(event.PeersRemoved))
      for (const id of event.PeersRemoved) {
        if (typeof id !== 'number') throw new Error('tailnet-watch-invalid');
        const stable = peers.get(id);
        if (stable !== undefined) removedNodeIds.push(stable);
        peers.delete(id);
      }
    if (Array.isArray(event.PeersChanged))
      for (const node of event.PeersChanged) remember(node, false);
    if (event.SelfChange !== undefined) selfNodeId = stableId(record(event.SelfChange).StableID);
    if (event.State === 2) selfNodeId = null;
    if (removedNodeIds.length || selfNodeId !== undefined)
      changed({ removedNodeIds, ...(selfNodeId === undefined ? {} : { selfNodeId }) });
  };
  let frame = '';
  let depth = 0;
  let quoted = false;
  let escaped = false;
  return (chunk: string): void => {
    for (const character of chunk) {
      if (depth === 0 && /\s/u.test(character)) continue;
      if (depth === 0 && character !== '{') throw new Error('tailnet-watch-invalid');
      frame += character;
      if (frame.length > 2 * 1024 * 1024) throw new Error('tailnet-watch-limit');
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') quoted = true;
      else if (character === '{') depth++;
      else if (character === '}') depth--;
      if (depth === 0) {
        const complete = frame;
        frame = '';
        notify(JSON.parse(complete));
      }
    }
  };
}

export function watchTailnet(
  changed: (change: TailnetChange) => void,
  stopped: (code: 'tailnet-watch-unavailable' | 'tailnet-watch-invalid') => void,
  startProcess: (binary: string) => ChildProcess = (binary) =>
    spawn(
      binary,
      ['debug', 'watch-ipn', '--initial-status', '--peer-changes', '--peer-patches=false'],
      { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
    ),
): () => Promise<void> {
  const binaries =
    process.platform === 'darwin'
      ? ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale']
      : ['tailscale'];
  let child: ChildProcess | undefined;
  const exits: Promise<void>[] = [];
  let closed = false;
  const fail = (code: 'tailnet-watch-unavailable' | 'tailnet-watch-invalid') => {
    if (closed) return;
    closed = true;
    if (child?.pid !== undefined) child.kill();
    void Promise.all(exits).then(() => stopped(code));
  };
  const launch = (index: number) => {
    const process = startProcess(binaries[index]!);
    exits.push(new Promise<void>((resolve) => process.once('close', () => resolve())));
    child = process;
    const read = createTailnetNotificationReader(changed);
    process.stdout?.setEncoding('utf8');
    process.stdout?.on('data', (chunk: string) => {
      if (closed || child !== process) return;
      try {
        read(chunk);
      } catch {
        fail('tailnet-watch-invalid');
      }
    });
    process.once('error', (error: NodeJS.ErrnoException) => {
      if (closed || child !== process) return;
      if (error.code === 'ENOENT' && index + 1 < binaries.length) launch(index + 1);
      else fail('tailnet-watch-unavailable');
    });
    process.once('close', () => {
      if (child === process) fail('tailnet-watch-unavailable');
    });
  };
  launch(0);
  return async () => {
    closed = true;
    if (child?.pid !== undefined) child.kill();
    await Promise.all(exits);
  };
}
