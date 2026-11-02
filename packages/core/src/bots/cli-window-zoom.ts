import { CliLiveError } from './cli-live-error.js';
export const WINDOW_ZOOM_COMMANDS = [
  { command: 'window-zoom-clients', description: 'list active desktop window targets' },
  { command: 'window-zoom-get', description: 'read zoom from an explicit --client-id' },
  {
    command: 'window-zoom-set',
    description: 'set --zoom-level (-8..8), optionally --zoom-default, on an explicit Client',
  },
  {
    command: 'window-zoom-reset',
    description: 'restore the explicit Client window to its saved default zoom',
  },
  {
    command: 'window-zoom-setup-status',
    description: 'read whether Desktop window zoom is installed or waiting for the app to quit',
  },
  {
    command: 'window-zoom-setup-enable',
    description: 'install Desktop window zoom after the app quits, then reopen it',
  },
  {
    command: 'window-zoom-setup-disable',
    description: 'remove Desktop window zoom after the app quits, then reopen it',
  },
  { command: 'window-zoom-setup-cancel', description: 'cancel a waiting window zoom setup' },
] as const;
const SETUP_ACTIONS: Record<string, string | undefined> = {
  'window-zoom-setup-enable': 'enable',
  'window-zoom-setup-disable': 'disable',
  'window-zoom-setup-cancel': 'cancel',
};
export const WINDOW_ZOOM_OPTIONS = {
  'client-id': { type: 'string' },
  'zoom-level': { type: 'string' },
  'zoom-default': { type: 'boolean' },
} as const;
export async function runWindowZoomCommand(
  command: string,
  rest: string[],
  values: {
    'client-id'?: string;
    'zoom-level'?: string;
    'zoom-default'?: boolean;
    'expected-revision'?: string;
  },
  connect: () => Promise<{
    http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
  }>,
): Promise<unknown> {
  if (command.startsWith('window-zoom-setup-')) {
    if (
      rest.length ||
      values['client-id'] ||
      values['zoom-level'] !== undefined ||
      values['zoom-default'] ||
      values['expected-revision']
    )
      throw new CliLiveError('usage', 'Window zoom setup acts on this Host; it takes no Client.');
    const action = SETUP_ACTIONS[command];
    const result = await (
      await connect()
    ).http('/api/botharness/window-zoom-setup', action === undefined ? undefined : { action });
    return JSON.parse(new TextDecoder().decode(result.bytes)) as unknown;
  }
  const list = command === 'window-zoom-clients';
  const write = command === 'window-zoom-set' || command === 'window-zoom-reset';
  if (rest.length || (list ? !!values['client-id'] : !values['client-id']))
    throw new CliLiveError('usage', 'Select exactly one --client-id from window-zoom-clients.');
  if (write ? !values['expected-revision'] : !!values['expected-revision'])
    throw new CliLiveError('usage', 'Writes require --expected-revision from window-zoom-get.');
  let operation: unknown;
  if (command === 'window-zoom-set') {
    const raw = values['zoom-level'];
    if (raw === undefined || !/^-?[0-8]$/.test(raw))
      throw new CliLiveError('usage', 'Specify integer --zoom-level from -8 to 8.');
    operation = { type: values['zoom-default'] ? 'default' : 'set', level: Number(raw) };
  } else {
    if (values['zoom-level'] !== undefined || values['zoom-default'])
      throw new CliLiveError('usage', 'Zoom level/default options require window-zoom-set.');
    if (command === 'window-zoom-reset') operation = { type: 'reset' };
  }
  const host = await connect();
  const result = await host.http(
    '/api/botharness/window-zoom-control',
    list
      ? undefined
      : {
          action: 'request',
          clientId: values['client-id'],
          ...(write ? { operation, expectedRevision: values['expected-revision'] } : {}),
        },
  );
  return JSON.parse(new TextDecoder().decode(result.bytes)) as unknown;
}
