import {
  voiceCatalogImportRequest,
  voiceCatalogRequest,
  type VoiceCatalogImportInput,
  type VoiceCatalogInput,
  type VoiceCatalogItem,
  type VoiceCatalogPage,
} from './catalog.js';
import { providerMessage, readBounded, statusError, unreachableMessage } from './provider-http.js';
import { VoiceError } from './provider-types.js';

const CATALOG_TIMEOUT_MS = 8_000;
const MAX_CATALOG_BODY_BYTES = 1024 * 1024;

export interface CatalogFetch {
  readonly fetch: typeof fetch;
  readonly timeoutMs: number;
}

export async function fetchVoiceCatalog(
  io: CatalogFetch,
  input: VoiceCatalogInput,
): Promise<VoiceCatalogPage> {
  const request = voiceCatalogRequest(input);
  if (request === undefined)
    throw new VoiceError(
      'invalid-input',
      'This speech service does not support that catalog or page.',
    );
  const data = request.parse(await catalogJson(io, request, input.key));
  if (data === undefined)
    throw new VoiceError('provider-bad-response', 'The provider returned an invalid catalog.');
  return data;
}

export async function importCatalogVoice(
  io: CatalogFetch,
  input: VoiceCatalogImportInput,
): Promise<VoiceCatalogItem> {
  const request = voiceCatalogImportRequest(input);
  if (request === undefined)
    throw new VoiceError(
      'invalid-input',
      'This speech service does not support adding shared voices.',
    );
  const data = request.parse(await catalogJson(io, request, input.key));
  if (data === undefined)
    throw new VoiceError(
      'provider-bad-response',
      'The provider did not return the added voice ID.',
    );
  return data;
}

async function catalogJson(
  io: CatalogFetch,
  request: { url: URL; init: RequestInit },
  key: string,
): Promise<unknown> {
  const signal = AbortSignal.timeout(Math.min(CATALOG_TIMEOUT_MS, io.timeoutMs));
  let response: Response;
  try {
    response = await io.fetch(request.url, { ...request.init, signal, redirect: 'error' });
  } catch (error) {
    throw new VoiceError(
      signal.aborted ? 'provider-timeout' : 'provider-unavailable',
      signal.aborted
        ? 'The provider catalog timed out.'
        : unreachableMessage(request.url.origin, error),
    );
  }
  if (!response.ok) throw statusError(response.status, await providerMessage(response, key));
  try {
    return JSON.parse(
      new TextDecoder().decode(await readBounded(response, MAX_CATALOG_BODY_BYTES)),
    );
  } catch {
    throw new VoiceError(
      signal.aborted ? 'provider-timeout' : 'provider-bad-response',
      signal.aborted
        ? 'The provider catalog timed out.'
        : 'The provider returned an invalid catalog response.',
    );
  }
}
