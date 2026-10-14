import type { DriverToolDescriptor } from './driver.js';

export const COMPUTER_TOOL_PREFIX = 'computer_';

export interface ComputerToolSpec {
  readonly raw: string;
  readonly audit: (args: Record<string, unknown>) => string;
}

function str(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '?';
}

function chars(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === 'string' ? `chars=${value.length}` : 'chars=?';
}

function windowRef(args: Record<string, unknown>): string {
  const pid = args['pid'];
  const windowId = args['window_id'];
  const parts: string[] = [];
  if (typeof pid === 'string' || typeof pid === 'number') parts.push(`pid=${pid}`);
  if (typeof windowId === 'string' || typeof windowId === 'number')
    parts.push(`window=${windowId}`);
  return parts.length === 0 ? 'window=-' : parts.join(' ');
}

export const COMPUTER_TOOLS: readonly ComputerToolSpec[] = [
  { raw: 'list_windows', audit: () => 'list windows' },
  {
    raw: 'get_desktop_state',
    audit: (args) => `desktop screenshot=${args['include_screenshot'] === false ? 'no' : 'yes'}`,
  },
  {
    raw: 'get_window_state',
    audit: (args) =>
      `${windowRef(args)} tree=${args['include_tree'] === false ? 'no' : 'yes'} screenshot=${
        args['include_screenshot'] === false ? 'no' : 'yes'
      }`,
  },
  { raw: 'launch_app', audit: (args) => `app=${str(args, 'app')}` },
  {
    raw: 'click',
    audit: (args) =>
      `${windowRef(args)} x=${str(args, 'x')} y=${str(args, 'y')} element=${str(args, 'element_index')}`,
  },
  { raw: 'type_text', audit: (args) => `${windowRef(args)} ${chars(args, 'text')}` },
  { raw: 'press_key', audit: (args) => `${windowRef(args)} key=${str(args, 'key')}` },
  { raw: 'hotkey', audit: (args) => `${windowRef(args)} keys=${str(args, 'keys')}` },
  {
    raw: 'scroll',
    audit: (args) => `${windowRef(args)} ${str(args, 'direction')} amount=${str(args, 'amount')}`,
  },
  {
    raw: 'verify_state',
    audit: (args) => `${windowRef(args)} predicate=${chars(args, 'predicate')}`,
  },
];

export const FALLBACK_TOOLS: readonly DriverToolDescriptor[] = [
  {
    name: 'list_windows',
    description: 'List top-level windows on the shared Computer desktop.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
  },
  {
    name: 'get_desktop_state',
    description: 'Capture the shared Computer desktop (screenshot and/or accessibility tree).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
  },
  {
    name: 'get_window_state',
    description:
      'Observe one window: accessibility tree with element indices plus an optional screenshot.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
  },
  {
    name: 'launch_app',
    description: 'Launch an application on the shared Computer desktop (for example a browser).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
  },
  {
    name: 'click',
    description: 'Click at coordinates or at an element index from the latest window observation.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
  },
  {
    name: 'type_text',
    description: 'Type text into a window. Never type credentials; ask the Human instead.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
  },
  {
    name: 'press_key',
    description: 'Press one key in a window.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
  },
  {
    name: 'hotkey',
    description: 'Press a key combination in a window (for example Ctrl+L).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
  },
  {
    name: 'scroll',
    description: 'Scroll inside the focused region of a window.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
  },
  {
    name: 'verify_state',
    description: 'Verify bounded predicates against one window before reporting success.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
  },
];

export function computerToolName(raw: string): string {
  return `${COMPUTER_TOOL_PREFIX}${raw}`;
}

export const COMPUTER_GUIDANCE = `You can act on this profile's shared Computer — a Linux (X11/XFCE) desktop inside a container with Chrome, shared by every PersonaBot of this profile. Other PersonaBots may be acting on the same desktop at the same time: stay inside the windows and tabs you opened.

Observe before you act. Call \`computer_get_window_state\` (or \`computer_list_windows\`) first; element indices and tokens belong to that exact snapshot. After any action, after a refusal, and after any Human input, take a fresh snapshot before the next action. \`computer_verify_state\` and fresh observations are how you confirm an outcome; "unknown" is not success.

Delivery: prefer background delivery. A refusal is a contract, not an obstacle — do not silently retry with foreground delivery.

Cancellation does not roll back. Input already delivered to the desktop stays delivered; re-observe before retrying.

Credentials are the Human's. Never type passwords, API keys, or recovery codes. When a page asks for a login, tell the Human in the chat what to log in to, then wait — the Human logs in through the Computer panel. Logins persist in the shared browser profile.

Before an externally visible action (posting, sending, purchasing, deleting), tell the Human what you are about to do in one short message. Computer Authorization lets you act; it is not blanket consent for surprising consequences. When done, report what you did with the window and outcome, and stop acting.`;

const LOCAL_DESKTOP: Readonly<Record<string, string>> = {
  darwin: 'the macOS desktop of the DSH Host, shared with the Human',
  win32: 'the Windows desktop of the DSH Host, shared with the Human',
  linux:
    'the Linux desktop of the DSH Host (its own display, or a private virtual display when the Host is a server), shared with the Human',
};

export function localComputerGuidance(platform: string = process.platform): string {
  return (
    COMPUTER_GUIDANCE.replace(
      'a Linux (X11/XFCE) desktop inside a container with Chrome',
      LOCAL_DESKTOP[platform] ?? 'the desktop of the DSH Host, shared with the Human',
    ).replace(
      'the Human logs in through the Computer panel',
      'the Human logs in directly on their own screen',
    ) +
    '\nLocal Computer has no viewer. Never assume a login is complete; ask the Human and re-observe the task window.'
  );
}

export const LOCAL_COMPUTER_GUIDANCE = localComputerGuidance('darwin');
