import { GENUI_DEFAULT_CSS } from './genui-appearance.js';
import {
  genuiDocumentIdentity,
  initialGenuiDocumentState,
  parseGenuiDocument,
  validateGenuiDocumentState,
  type GenuiDocument,
  type GenuiDocumentState,
} from './genui-document.js';

export const GENUI_HTML_POLICY_VERSION = 'botharness-html-1';
export const GENUI_HTML_PROTOCOL = 'botharness-genui-v1';
export const GENUI_HTML_RUNTIME_LIMITS = Object.freeze({
  minHeight: 48,
  maxHeight: 20_000,
  messageBytes: 16_384,
  messagesPerSecond: 30,
  startupMs: 10_000,
  heartbeatMs: 1000,
  heartbeatTimeoutMs: 5000,
});

export type GenuiHtmlMessage = {
  protocol: typeof GENUI_HTML_PROTOCOL;
  instanceId: string;
  sequence: number;
} & (
  | { type: 'ready' | 'heartbeat' }
  | { type: 'height'; height: number }
  | { type: 'state'; state: GenuiDocumentState }
  | { type: 'error'; message: string }
);

export function parseGenuiHtmlMessage(
  value: unknown,
  instanceId: string,
): GenuiHtmlMessage | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const message = value as Record<string, unknown>;
  if (message['protocol'] !== GENUI_HTML_PROTOCOL || message['instanceId'] !== instanceId)
    return undefined;
  const sequence = message['sequence'];
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 1)
    return undefined;
  try {
    if (
      new TextEncoder().encode(JSON.stringify(value)).length >
      GENUI_HTML_RUNTIME_LIMITS.messageBytes
    )
      return undefined;
  } catch {
    return undefined;
  }
  const base = { protocol: GENUI_HTML_PROTOCOL, instanceId, sequence } as const;
  switch (message['type']) {
    case 'ready':
    case 'heartbeat':
      return { ...base, type: message['type'] };
    case 'height': {
      const height = message['height'];
      return typeof height === 'number' &&
        Number.isFinite(height) &&
        height >= GENUI_HTML_RUNTIME_LIMITS.minHeight &&
        height <= GENUI_HTML_RUNTIME_LIMITS.maxHeight
        ? { ...base, type: 'height', height }
        : undefined;
    }
    case 'error':
      return typeof message['message'] === 'string' && message['message'].length <= 1000
        ? { ...base, type: 'error', message: message['message'] }
        : undefined;
    case 'state': {
      const state = message['state'];
      if (typeof state !== 'object' || state === null || Array.isArray(state)) return undefined;
      const candidate = state as Record<string, unknown>;
      if (candidate['version'] !== 1 || Object.keys(candidate).length !== 2) return undefined;
      const values = candidate['values'];
      if (typeof values !== 'object' || values === null || Array.isArray(values)) return undefined;
      if (
        Object.keys(values).length > 16 ||
        Object.entries(values).some(
          ([key, item]) =>
            !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/u.test(key) ||
            ['__proto__', 'constructor', 'prototype'].includes(key) ||
            !(
              typeof item === 'boolean' ||
              (typeof item === 'number' && Number.isFinite(item)) ||
              (typeof item === 'string' && item.length <= 500)
            ),
        )
      )
        return undefined;
      return { ...base, type: 'state', state: candidate as unknown as GenuiDocumentState };
    }
    default:
      return undefined;
  }
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function documentBootstrap(
  instanceId: string,
  initial: GenuiDocumentState,
  stateful: boolean,
): string {
  return `(() => {
    const protocol = ${scriptJson(GENUI_HTML_PROTOCOL)};
    const instanceId = ${scriptJson(instanceId)};
    const send = parent.postMessage.bind(parent);
    const stringify = JSON.stringify.bind(JSON);
    let state = ${scriptJson(initial)};
    let sequence = 0;
    const emit = (type, payload = {}) => send({ protocol, instanceId, sequence: ++sequence, type, ...payload }, '*');
    Object.defineProperty(window, 'genui', { value: Object.freeze({
      getState: () => JSON.parse(stringify(state.values)),
      setState: (values) => {
        if (!${stateful}) throw new Error('This document has no registered private state.');
        const next = { version: 1, values };
        if (stringify(next).length > 8192) throw new Error('Private state is too large.');
        emit('state', { state: next });
        state = JSON.parse(stringify(next));
      }
    }), writable: false, configurable: false });
    addEventListener('message', (event) => {
      if (event.source !== parent || event.origin !== 'null') return;
      const message = event.data;
      if (!message || message.protocol !== protocol || message.instanceId !== instanceId) return;
      if (message.type === 'restore') {
        state = message.state;
        dispatchEvent(new CustomEvent('genui:state', { detail: window.genui.getState() }));
      } else if (message.type === 'theme' && ['light', 'dark'].includes(message.theme)) {
        document.documentElement.style.colorScheme = message.theme;
      }
    });
    addEventListener('error', () => emit('error', { message: 'The document script failed.' }));
    addEventListener('unhandledrejection', () => emit('error', { message: 'The document script failed.' }));
    let queued = false;
    const measure = () => {
      if (queued) return;
      queued = true;
      setTimeout(() => {
        queued = false;
        const height = Math.ceil(Math.max(document.body?.scrollHeight || 0, document.body?.getBoundingClientRect().height || 0));
        if (height > ${GENUI_HTML_RUNTIME_LIMITS.maxHeight}) {
          emit('error', { message: 'The document exceeds the height limit.' });
        } else {
          emit('height', { height: Math.max(${GENUI_HTML_RUNTIME_LIMITS.minHeight}, height) });
        }
      }, 50);
    };
    addEventListener('DOMContentLoaded', () => {
      new ResizeObserver(measure).observe(document.documentElement);
      new MutationObserver(measure).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      emit('ready');
      measure();
    }, { once: true });
    setInterval(() => { measure(); emit('heartbeat'); }, ${GENUI_HTML_RUNTIME_LIMITS.heartbeatMs});
  })();`;
}

export function buildGenuiHtmlDocument(
  value: GenuiDocument,
  options: { instanceId: string; theme: 'light' | 'dark'; state?: GenuiDocumentState },
): { html: string; documentId: string; policyVersion: string } {
  const document = parseGenuiDocument(value);
  if (options.theme !== 'light' && options.theme !== 'dark')
    throw new Error('Invalid GenUI theme.');
  if (!/^[a-zA-Z0-9-]{1,100}$/u.test(options.instanceId))
    throw new Error('Invalid GenUI frame identity.');
  const state = validateGenuiDocumentState(
    document,
    options.state ?? initialGenuiDocumentState(document),
  );
  const contentPolicy = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    'img-src data:',
    "connect-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "font-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  const inner = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${contentPolicy}"><meta name="referrer" content="no-referrer"><style>:root{color-scheme:${options.theme}}${GENUI_DEFAULT_CSS}</style><script>${documentBootstrap(options.instanceId, state, document.stateContract !== undefined)}</script></head><body>${document.html}</body></html>`;
  const guardianPolicy =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; frame-src 'none'; base-uri 'none'; form-action 'none'";
  const guardian = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${guardianPolicy}"><meta name="referrer" content="no-referrer"><style>html,body{margin:0;overflow:hidden}iframe{display:block;border:0;width:100%;height:${GENUI_HTML_RUNTIME_LIMITS.minHeight}px}</style></head><body><iframe title="Generated content" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe><script nonce="genui-guardian">(() => {
    const protocol = ${scriptJson(GENUI_HTML_PROTOCOL)};
    const instanceId = ${scriptJson(options.instanceId)};
    const frame = document.querySelector('iframe');
    let epoch = Date.now(), count = 0, sequence = 0;
    const relay = (message) => parent.postMessage(message, '*');
    addEventListener('message', (event) => {
      const message = event.data;
      if (!message || message.protocol !== protocol || message.instanceId !== instanceId) return;
      if (event.source === parent) {
        if (message.type === 'restore' || message.type === 'theme') frame.contentWindow.postMessage(message, '*');
        return;
      }
      if (event.source !== frame.contentWindow || event.origin !== 'null') return;
      if (Date.now() - epoch >= 1000) { epoch = Date.now(); count = 0; }
      if (++count > ${GENUI_HTML_RUNTIME_LIMITS.messagesPerSecond}) return;
      try { if (JSON.stringify(message).length > ${GENUI_HTML_RUNTIME_LIMITS.messageBytes}) return; } catch { return; }
      if (!['ready', 'height', 'state', 'error', 'heartbeat'].includes(message.type)) return;
      if (!Number.isSafeInteger(message.sequence) || message.sequence <= sequence) return;
      sequence = message.sequence;
      if (message.type === 'height') {
        if (!Number.isFinite(message.height) || message.height < ${GENUI_HTML_RUNTIME_LIMITS.minHeight} || message.height > ${GENUI_HTML_RUNTIME_LIMITS.maxHeight}) return;
        frame.style.height = message.height + 'px';
      }
      relay(message);
    });
    frame.srcdoc = ${scriptJson(inner)};
  })();</script></body></html>`;
  return {
    html: guardian,
    documentId: genuiDocumentIdentity(document),
    policyVersion: GENUI_HTML_POLICY_VERSION,
  };
}
