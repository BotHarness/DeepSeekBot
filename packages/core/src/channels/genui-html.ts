import { createHash } from 'node:crypto';
import {
  genuiDocumentIdentity,
  parseGenuiDocument,
  type GenuiDocument,
  type GenuiDocumentState,
} from './genui-document.js';
import { GENUI_DOCUMENT_POLICY_VERSION } from './genui-document-policy.js';
import { buildGenuiPageHtml } from './genui-page.js';

export interface GenuiRuntimeSource {
  source: string;
  sha256: string;
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
  const source = Buffer.from(options.runtime.source, 'utf8');
  if (
    source.byteLength === 0 ||
    source.byteLength > 2_097_152 ||
    !/^[a-f0-9]{64}$/u.test(options.runtime.sha256) ||
    createHash('sha256').update(source).digest('hex') !== options.runtime.sha256
  )
    throw Error('The packaged GenUI renderer is invalid.');
  return {
    html: buildGenuiPageHtml(document, {
      instanceId: options.instanceId,
      theme: options.theme,
      ...(options.state === undefined ? {} : { state: options.state }),
      runtimeBase64: source.toString('base64'),
      bridge: 'preview',
    }),
    documentId: genuiDocumentIdentity(document),
    policyVersion: GENUI_DOCUMENT_POLICY_VERSION,
    runtimeSha256: options.runtime.sha256,
  };
}
