import type {
  VoiceRequestTemplate,
  VoiceTemplateJson,
  VoiceTemplateValidation,
} from '@botharness/host-protocol/voice-request-template';

export type TemplateKind = 'tts' | 'asr';
export type AuthKind = VoiceRequestTemplate['auth']['kind'];
export type BodyKind = VoiceRequestTemplate['body']['kind'];
export type ResultKind = VoiceRequestTemplate['result']['kind'];

export interface TemplateDraft {
  readonly method: VoiceRequestTemplate['method'];
  readonly url: string;
  readonly auth: AuthKind;
  readonly authName: string;
  readonly authPrefix: string;
  readonly headers: string;
  readonly bodyKind: BodyKind;
  readonly body: string;
  readonly resultKind: ResultKind;
  readonly resultPath: string;
}

export type TemplateField =
  | 'url'
  | 'method'
  | 'auth'
  | 'authName'
  | 'authPrefix'
  | 'headers'
  | 'body'
  | 'result'
  | 'resultPath'
  | 'form';

export type TemplateErrors = Partial<Record<TemplateField, string>>;

export const TTS_PLACEHOLDERS = ['{text}', '{voice}', '{model}', '{format}', '{language}'];
export const ASR_PLACEHOLDERS = [
  '{audio}',
  '{audioBase64}',
  '{audioDataUrl}',
  '{model}',
  '{language}',
];

export const TEMPLATE_AUTH_KINDS: readonly AuthKind[] = ['bearer', 'header', 'query', 'none'];
export const TEMPLATE_BODY_KINDS: readonly BodyKind[] = ['json', 'ssml', 'multipart', 'none'];
export const TTS_RESULT_KINDS: readonly Exclude<ResultKind, 'text'>[] = [
  'audio',
  'base64',
  'hex',
  'url',
];

export function placeholdersFor(kind: TemplateKind): readonly string[] {
  return kind === 'tts' ? TTS_PLACEHOLDERS : ASR_PLACEHOLDERS;
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function bodyText(body: VoiceRequestTemplate['body']): string {
  if (body.kind === 'json') return pretty(body.value);
  if (body.kind === 'ssml') return pretty(body.root);
  if (body.kind === 'multipart') return pretty(body.fields);
  return '';
}

export function draftFromTemplate(template: VoiceRequestTemplate): TemplateDraft {
  const { auth, result } = template;
  return {
    method: template.method,
    url: template.url,
    auth: auth.kind,
    authName: auth.kind === 'header' || auth.kind === 'query' ? auth.name : '',
    authPrefix: auth.kind === 'header' ? auth.prefix : '',
    headers: Object.keys(template.headers).length === 0 ? '' : pretty(template.headers),
    bodyKind: template.body.kind,
    body: bodyText(template.body),
    resultKind: result.kind,
    resultPath: result.kind === 'audio' ? '' : result.path,
  };
}

export function blankDraft(kind: TemplateKind): TemplateDraft {
  return {
    method: 'POST',
    url: '',
    auth: 'bearer',
    authName: '',
    authPrefix: '',
    headers: '',
    bodyKind: kind === 'tts' ? 'json' : 'multipart',
    body:
      kind === 'tts' ? pretty({ text: '{text}', voice: '{voice}' }) : pretty({ file: '{audio}' }),
    resultKind: kind === 'tts' ? 'audio' : 'text',
    resultPath: kind === 'tts' ? '' : 'text',
  };
}

function parseJson(text: string): { ok: true; value: VoiceTemplateJson } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as VoiceTemplateJson };
  } catch {
    return { ok: false };
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type BuildResult =
  | { readonly ok: true; readonly template: unknown }
  | { readonly ok: false; readonly errors: TemplateErrors };

export interface BuildMessages {
  readonly invalidJson: string;
  readonly expectObject: string;
}

export function buildTemplate(draft: TemplateDraft, messages: BuildMessages): BuildResult {
  const errors: TemplateErrors = {};
  let headers: unknown = {};
  if (draft.headers.trim() !== '') {
    const parsed = parseJson(draft.headers);
    if (!parsed.ok) errors.headers = messages.invalidJson;
    else if (!isObject(parsed.value)) errors.headers = messages.expectObject;
    else headers = parsed.value;
  }
  let body: unknown = { kind: 'none' };
  if (draft.bodyKind !== 'none') {
    const parsed = parseJson(draft.body);
    if (!parsed.ok) errors.body = messages.invalidJson;
    else if (draft.bodyKind !== 'json' && !isObject(parsed.value))
      errors.body = messages.expectObject;
    else if (draft.bodyKind === 'json') body = { kind: 'json', value: parsed.value };
    else if (draft.bodyKind === 'ssml') body = { kind: 'ssml', root: parsed.value };
    else body = { kind: 'multipart', fields: parsed.value };
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const auth =
    draft.auth === 'header'
      ? { kind: 'header', name: draft.authName.trim(), prefix: draft.authPrefix }
      : draft.auth === 'query'
        ? { kind: 'query', name: draft.authName.trim() }
        : { kind: draft.auth };
  const result =
    draft.resultKind === 'audio'
      ? { kind: 'audio' }
      : { kind: draft.resultKind, path: draft.resultPath.trim() };
  return {
    ok: true,
    template: {
      version: 1,
      url: draft.url.trim(),
      method: draft.method,
      auth,
      headers,
      body,
      result,
    },
  };
}

export function fieldOf(path: string): TemplateField {
  const [head, next] = path.split('.');
  if (head === 'url' || head === 'method' || head === 'headers' || head === 'body') return head;
  if (head === 'auth')
    return next === 'name' ? 'authName' : next === 'prefix' ? 'authPrefix' : 'auth';
  if (head === 'result') return next === 'path' ? 'resultPath' : 'result';
  return 'form';
}

export function templateErrors(
  errors: readonly { readonly path: string; readonly message: string }[],
): TemplateErrors {
  const mapped: TemplateErrors = {};
  for (const error of errors) {
    const field = fieldOf(error.path);
    const detail =
      field === 'form' || error.path.split('.').length <= 1
        ? error.message
        : `${field === 'headers' ? error.path.slice('headers.'.length) : error.path}: ${error.message}`;
    mapped[field] = mapped[field] === undefined ? detail : `${mapped[field]} ${detail}`;
  }
  return mapped;
}

export type TemplateCheck =
  | { readonly ok: true; readonly template: VoiceRequestTemplate }
  | { readonly ok: false; readonly errors: TemplateErrors };

export async function checkTemplate(
  validate: (kind: TemplateKind, template: unknown) => Promise<VoiceTemplateValidation>,
  kind: TemplateKind,
  draft: TemplateDraft,
  messages: BuildMessages,
): Promise<TemplateCheck> {
  const built = buildTemplate(draft, messages);
  if (!built.ok) return built;
  const result = await validate(kind, built.template);
  return result.valid
    ? { ok: true, template: result.template }
    : { ok: false, errors: templateErrors(result.errors) };
}
