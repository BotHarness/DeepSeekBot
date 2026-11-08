import { createHash } from 'node:crypto';
import {
  genuiDocumentIdentity,
  initialGenuiDocumentState,
  parseGenuiDocument,
  validateGenuiDocumentState,
  type GenuiDocument,
  type GenuiDocumentState,
} from './genui-document.js';
import { GENUI_DOCUMENT_POLICY_VERSION } from './genui-document-policy.js';

export interface GenuiRuntimeSource {
  source: string;
  sha256: string;
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

export function buildGenuiHtmlDocument(
  value: GenuiDocument,
  options: {
    instanceId: string;
    theme: 'light' | 'dark';
    state?: GenuiDocumentState;
    runtime: GenuiRuntimeSource;
  },
): { html: string; documentId: string; policyVersion: string; runtimeSha256: string } {
  const document = parseGenuiDocument(value);
  if (options.theme !== 'light' && options.theme !== 'dark') throw Error('Invalid GenUI theme.');
  if (!/^[a-zA-Z0-9-]{1,100}$/u.test(options.instanceId))
    throw Error('Invalid GenUI frame identity.');
  const source = Buffer.from(options.runtime.source, 'utf8');
  if (
    source.byteLength === 0 ||
    source.byteLength > 2_097_152 ||
    !/^[a-f0-9]{64}$/u.test(options.runtime.sha256) ||
    createHash('sha256').update(source).digest('hex') !== options.runtime.sha256
  )
    throw Error('The packaged GenUI renderer is invalid.');
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
    instanceId: options.instanceId,
    generation: 1,
  };
  const bootstrap = `(() => {
    const status = { ready: false, measured: false, failed: false, height: 48, diagnostics: [] };
    window.__genuiPreview = status;
    const failed = (reason) => {
      status.failed = true;
      status.ready = false;
      if (status.diagnostics.length < 8) status.diagnostics.push('The document could not run: ' + reason);
    };
    try {
      const surface = __BotHarnessGenuiRuntime.mountGenuiDocument(document.querySelector('#genui-document'), {
        ...${scriptJson(config)},
        onState: () => {},
        onHeight: (height) => { status.height = height; status.measured = true; },
        onFailure: failed,
      });
      surface.ready.then(() => { if (!status.failed) status.ready = true; }, () => { if (!status.failed) failed('startup'); });
      addEventListener('pagehide', () => surface.dispose(), { once: true });
    } catch { failed('unsupported'); }
  })();`;
  return {
    html: `<!doctype html><html style="color-scheme:${options.theme}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><style>html,body{margin:0;background:Canvas}#genui-document{width:100%}</style><script nonce="${nonce}" src="data:application/javascript;base64,${source.toString('base64')}"></script></head><body><div id="genui-document"></div><script nonce="${nonce}">${bootstrap}</script></body></html>`,
    documentId: genuiDocumentIdentity(document),
    policyVersion: GENUI_DOCUMENT_POLICY_VERSION,
    runtimeSha256: options.runtime.sha256,
  };
}
