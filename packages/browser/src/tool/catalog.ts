import { statSync } from 'node:fs';
import { basename } from 'node:path';

export const BROWSER_TOOL_PREFIX = 'browser_';

export interface BrowserToolSpec {
  readonly raw: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
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

export const BROWSER_TOOLS: readonly BrowserToolSpec[] = [
  {
    raw: 'open',
    description:
      "Open a URL in this PersonaBot's Bot Browser window. Reuses the Bot's current tab when one exists, otherwise opens a new window. Returns the page URL and title.",
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Absolute http(s) URL to open, for example https://example.com',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
    audit: (args) => `url=${str(args, 'url').slice(0, 160)}`,
  },
  {
    raw: 'observe',
    description:
      "Observe this PersonaBot's current Bot Browser tab: the page URL and title, visible text (bounded), and interactive elements with refs. Refs belong to this observation only; re-observe after navigation, after a refusal, and after any Human input.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    audit: () => 'observe',
  },
  {
    raw: 'screenshot',
    description:
      "Capture this PersonaBot's current Bot Browser tab as an image for visual verification (layout, images, charts). The image is 1:1 with the viewport in CSS pixels, so its coordinates can be passed to browser_click x/y when an element has no ref. Returns an image when the active route supports it, otherwise a readable fallback; the capture is also saved on the Host and its path is reported.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    audit: () => 'screenshot',
  },
  {
    raw: 'click',
    description:
      'Click a target: pass a ref from the latest browser_observe (including elements listed as clickable), or viewport coordinates (x, y in CSS pixels from the latest browser_screenshot) for targets without a ref. Refs scroll into view first.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: 'Exact element ref copied from the latest browser_observe',
        },
        x: { type: 'number', description: 'Viewport CSS x from the latest screenshot' },
        y: { type: 'number', description: 'Viewport CSS y from the latest screenshot' },
      },
      additionalProperties: false,
    },
    audit: (args) =>
      typeof args['ref'] === 'string'
        ? `ref=${args['ref']}`
        : `x=${str(args, 'x')} y=${str(args, 'y')}`,
  },
  {
    raw: 'type',
    description:
      'Type text into the input, textarea, or editable element with a ref from the latest browser_observe. Input and change events are dispatched so frameworks see the value.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: 'Exact element ref copied from the latest browser_observe',
        },
        text: { type: 'string', description: 'Text to enter' },
      },
      required: ['ref', 'text'],
      additionalProperties: false,
    },
    audit: (args) => `ref=${str(args, 'ref')} ${chars(args, 'text')}`,
  },
  {
    raw: 'press_key',
    description:
      'Press one native key on the focused element of the current Bot Browser tab. Supports Enter, Tab, Escape, Backspace, Delete, Arrow keys, Home, End, PageUp, PageDown, Insert, F1–F12, Space and printable ASCII characters. Key chords are not supported; use browser_type for arbitrary text.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
      additionalProperties: false,
    },
    audit: (args) => `key=${str(args, 'key')}`,
  },
  {
    raw: 'scroll',
    description:
      'Send a native wheel up or down by a bounded amount of CSS pixels at the current viewport center; this scrolls the document or nested content under that point. Observe again to verify movement.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down'] },
        amount: { type: 'number', description: 'Pixels, 100-2000 (default 600)' },
      },
      additionalProperties: false,
    },
    audit: (args) =>
      `${typeof args['direction'] === 'string' ? args['direction'] : 'down'} amount=${str(args, 'amount')}`,
  },
  {
    raw: 'upload',
    description:
      'Attach a file from the Host to the current Bot Browser tab: a file-input ref selects that exact field without opening a dialog; another ref clicks the upload control and intercepts its dialog. Without ref, the first page file input is used; a picker-control ref selects the input that actually opened its chooser. Use a path returned by browser_screenshot or a file you created. Uploading is externally visible: confirm with the Human before posting.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description:
            'Optional observed file-input ref, or ref of the control that opens the file picker',
        },
        path: { type: 'string', description: 'Absolute path to a file on the Host' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    audit: (args) => {
      const path = str(args, 'path');
      let size: number | undefined;
      try {
        size = statSync(path).size;
      } catch {}
      return `file=${basename(path)} bytes=${size ?? '?'}${typeof args['ref'] === 'string' ? ` ref=${args['ref']}` : ''}`;
    },
  },
  {
    raw: 'tabs',
    description:
      "Manage this PersonaBot's Bot Browser tabs: action list shows its tabs (the current one is marked *), open opens a URL in a new tab of its window, select makes a tab current for observe and actions, and close closes one.",
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'open', 'select', 'close'] },
        url: { type: 'string', description: 'For action open: absolute http(s) URL' },
        targetId: {
          type: 'string',
          description: 'For action select/close: a tab id from action list',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    audit: (args) =>
      `${str(args, 'action')}${
        typeof args['url'] === 'string' ? ` ${args['url'].slice(0, 160)}` : ''
      }${typeof args['targetId'] === 'string' ? ` ${args['targetId']}` : ''}`,
  },
  {
    raw: 'wait',
    description: 'Wait a bounded time (up to 10 seconds) for the page to settle after an action.',
    inputSchema: {
      type: 'object',
      properties: { ms: { type: 'number' } },
      additionalProperties: false,
    },
    audit: (args) => `ms=${str(args, 'ms')}`,
  },
];

export function browserToolName(raw: string): string {
  return `${BROWSER_TOOL_PREFIX}${raw}`;
}

export const BROWSER_GUIDANCE = `You can browse the web through this profile's shared Bot Browser — a real browser window owned by BotHarness, shared by every PersonaBot of this profile. Other PersonaBots may be browsing at the same time: stay inside the tabs you opened.

Observe before you act. Call \`browser_open\` to open a page (it reuses your current tab) and \`browser_observe\` to read it; element refs belong to that exact observation. Every new observation replaces its previous refs; copy the returned ref exactly rather than constructing one. Elements listed with role \`clickable\` are role-less click targets (icons, custom buttons) and take refs like any other. Act with \`browser_click\`, \`browser_type\`, \`browser_press_key\`, and \`browser_scroll\` on those refs; when a target has no ref at all, take \`browser_screenshot\` and click by x/y coordinates. A stale ref is a contract, not an obstacle: re-observe and retry. Re-observe after navigation, after a refusal, and after any Human input.

You may keep several tabs in your own Bot Browser window with \`browser_tabs\` (list, open, select, close); observe and act on the current tab, and select another one before reading it. The Human can close your tabs at any time; when a call reports a missing tab, list your tabs and select one, or open a new one.

\`browser_upload\` attaches a Host file (for example a path returned by \`browser_screenshot\`) to a page's file input without the system dialog; uploading is an externally visible action, so confirm with the Human first.

The Human can always operate the local Bot Browser window directly. Pause Bot stops only your browser actions and model-facing screenshots; browser_observe remains available. When Browser Pause refuses an action, wait for the Human to Resume, then re-observe before acting. Never bypass a pause with another tool.

Credentials are the Human's. The Bot Browser has its own persistent profile; when a page asks for a login, a verification code or a CAPTCHA, call \`takeover_request\` with target browser, a short title and one sentence saying what the Human should do. A card appears in the conversation and your turn ends; the Human signs in through the live view and their result (done, could not finish, cancelled or expired) wakes you through the Bot Inbox. Then call \`browser_observe\` before acting. Never type passwords, API keys, or recovery codes.

Before an externally visible action (posting, sending, purchasing, deleting), tell the Human what you are about to do in one short message. Browser Authorization lets you act; it is not blanket consent for surprising consequences. When done, report which page you read and what you concluded, and stop acting.`;
