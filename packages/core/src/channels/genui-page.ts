import {
  initialGenuiDocumentState,
  parseGenuiDocument,
  validateGenuiDocumentState,
  type GenuiDocument,
  type GenuiDocumentState,
} from './genui-document.js';
import { GENUI_DOCUMENT_LIMITS } from './genui-document-limits.js';

export const GENUI_PAGE_FAILURES = [
  'startup',
  'execution',
  'memory',
  'resource',
  'unsupported',
  'invalid-content',
] as const;

export type GenuiPageBridge = 'preview' | 'native';

export interface GenuiPageOptions {
  instanceId: string;
  theme: 'light' | 'dark';
  state?: GenuiDocumentState;
  textScale?: number;
  runtimeBase64: string;
  bridge: GenuiPageBridge;
}

export const GENUI_NATIVE_INBOUND_BYTES = GENUI_DOCUMENT_LIMITS.stateBytes + 512;

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

const previewReport = `const status = { ready: false, measured: false, failed: false, failure: undefined, height: 48, diagnostics: [] };
    window.__genuiPreview = status;
    const failed = (reason) => {
      status.failed = true;
      status.ready = false;
      status.failure = ${scriptJson(GENUI_PAGE_FAILURES)}.includes(reason) ? reason : 'unsupported';
      if (status.diagnostics.length < 8) status.diagnostics.push('The document could not run: ' + reason);
    };
    const measured = (height) => { status.height = height; status.measured = true; };
    const ready = () => { if (!status.failed) status.ready = true; };
    const startupFailed = () => { if (!status.failed) failed('startup'); };
    const changed = () => {};
    const attach = () => {};`;

function nativeReport(instanceId: string): string {
  return `const channel = window.ReactNativeWebView;
    let stopped = false;
    const post = (message) => { try { channel.postMessage(JSON.stringify({ instanceId: ${scriptJson(instanceId)}, ...message })); } catch {} };
    const failed = (reason) => {
      if (stopped) return;
      stopped = true;
      post({ type: 'failure', reason: ${scriptJson(GENUI_PAGE_FAILURES)}.includes(reason) ? reason : 'unsupported' });
    };
    const measured = (height) => { if (!stopped) post({ type: 'height', height }); };
    const ready = () => { if (!stopped) post({ type: 'ready' }); };
    const startupFailed = () => failed('startup');
    const changed = (state) => { if (!stopped) post({ type: 'state', state }); };
    const attach = (surface) => {
      const receive = (event) => {
        if (stopped || typeof event.data !== 'string' || event.data.length > ${GENUI_NATIVE_INBOUND_BYTES}) return;
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (!message || message.instanceId !== ${scriptJson(instanceId)} || message.type !== 'restore' || Object.keys(message).length !== 3) return;
        try { surface.restore(message.state); } catch { failed('invalid-content'); }
      };
      addEventListener('message', receive);
      document.addEventListener('message', receive);
    };`;
}

export function buildGenuiPageHtml(value: GenuiDocument, options: GenuiPageOptions): string {
  const document = parseGenuiDocument(value);
  if (options.theme !== 'light' && options.theme !== 'dark') throw Error('Invalid GenUI theme.');
  if (!/^[a-zA-Z0-9-]{1,100}$/u.test(options.instanceId))
    throw Error('Invalid GenUI frame identity.');
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(options.runtimeBase64))
    throw Error('The packaged GenUI renderer is invalid.');
  if (
    options.textScale !== undefined &&
    (!Number.isFinite(options.textScale) || options.textScale <= 0)
  )
    throw Error('Invalid GenUI text scale.');
  const state = validateGenuiDocumentState(
    document,
    options.state ?? initialGenuiDocumentState(document),
  );
  const nonce = options.instanceId;
  const policy = `default-src 'none'; script-src 'nonce-${nonce}' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; worker-src blob:; frame-src 'self'; connect-src 'none'; img-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  const config = {
    document,
    state,
    theme: options.theme,
    ...(options.textScale === undefined ? {} : { textScale: options.textScale }),
    instanceId: options.instanceId,
    generation: 1,
  };
  const report = options.bridge === 'native' ? nativeReport(options.instanceId) : previewReport;
  const bootstrap = `(() => {
    ${report}
    try {
      const surface = __BotHarnessGenuiRuntime.mountGenuiDocument(document.querySelector('#genui-document'), {
        ...${scriptJson(config)},
        onState: changed,
        onHeight: measured,
        onFailure: failed,
      });
      attach(surface);
      surface.ready.then(ready, startupFailed);
      addEventListener('pagehide', () => surface.dispose(), { once: true });
    } catch { failed('unsupported'); }
  })();`;
  return `<!doctype html><html style="color-scheme:${options.theme}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><style>html,body{margin:0;background:Canvas}#genui-document{width:100%}</style><script nonce="${nonce}" src="data:application/javascript;base64,${options.runtimeBase64}"></script></head><body><div id="genui-document"></div><script nonce="${nonce}">${bootstrap}</script></body></html>`;
}
