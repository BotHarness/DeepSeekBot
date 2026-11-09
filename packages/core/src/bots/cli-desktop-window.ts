import { CliLiveError } from './cli-live-error.js';

export const DESKTOP_WINDOW_COMMANDS = [
  {
    command: 'desktop-window-reveal',
    description: 'restore and focus the Windows Desktop window of this Host',
  },
] as const;

export async function runDesktopWindowCommand(
  rest: string[],
  connect: () => Promise<{
    http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
  }>,
): Promise<unknown> {
  if (rest.length) throw new CliLiveError('usage', 'desktop-window-reveal takes no arguments.');
  const result = await (
    await connect()
  ).http('/api/botharness/desktop-window', { action: 'reveal' });
  return JSON.parse(new TextDecoder().decode(result.bytes)) as unknown;
}
