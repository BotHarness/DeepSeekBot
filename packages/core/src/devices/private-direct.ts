import { spawn } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';
import { locateFrom } from './cloudflared.js';

const edgeIssue = z.enum([
  'direct-port-busy',
  'direct-port-permission',
  'direct-bind-failed',
  'direct-inbound-closed',
  'direct-public-address-missing',
  'direct-acme-failed',
]);

const edgeEvent = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('bound'), origin: z.string() }),
  z.object({ phase: z.literal('certificate-ready') }),
  z.object({ phase: z.literal('certificate-failed'), issue: edgeIssue }),
  z.object({ phase: z.literal('certificate-renewal-failed'), issue: edgeIssue }),
  z.object({ phase: z.literal('failed'), issue: edgeIssue }),
]);

export type DirectEdgeEvent = z.infer<typeof edgeEvent>;
export type DirectEdgeIssue =
  | z.infer<typeof edgeIssue>
  | 'direct-binary-missing'
  | 'direct-edge-exited';

export type StartDirectEdge = (input: {
  port: number;
  hostname?: string;
  onEvent(event: DirectEdgeEvent): void;
  onExit(issue: 'direct-binary-missing' | 'direct-edge-exited'): void;
}) => (() => Promise<void>) | undefined;

export function directEdgeStarter(data: string, anchors: readonly string[]): StartDirectEdge {
  return ({ port, hostname, onEvent, onExit }) => {
    const override = process.env['BOTHARNESS_DIRECT_EDGE_BINARY'];
    const embedded =
      process.platform === 'linux'
        ? locateFrom(anchors)(`@botharness/tobs-relay-linux-${process.arch}`)
        : undefined;
    const binary =
      override && isAbsolute(override) ? override : embedded && join(embedded, 'bin', 'tobs-relay');
    if (binary === undefined) return;
    const args = ['edge', '--upstream-port', String(port), '--data', data];
    if (hostname) args.push('--hostname', hostname);
    const child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    child.stdin.on('error', () => {});
    child.stdout.setEncoding('utf8');
    let pending = '';
    child.stdout.on('data', (chunk: string) => {
      pending += chunk;
      let end = pending.indexOf('\n');
      while (end !== -1) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        end = pending.indexOf('\n');
        try {
          const event = edgeEvent.safeParse(JSON.parse(line));
          if (event.success) onEvent(event.data);
        } catch {}
      }
      if (pending.length > 1024) pending = '';
    });
    let issue: 'direct-binary-missing' | 'direct-edge-exited' = 'direct-edge-exited';
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT' || error.code === 'EACCES') issue = 'direct-binary-missing';
    });
    const closed = new Promise<void>((resolve) => {
      child.once('close', () => {
        resolve();
        onExit(issue);
      });
    });
    return async () => {
      child.stdin.end();
      const kill = setTimeout(() => child.kill('SIGKILL'), 2_000);
      kill.unref();
      try {
        await closed;
      } finally {
        clearTimeout(kill);
      }
    };
  };
}
