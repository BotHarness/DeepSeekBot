import { templateUrl, type SsmlNode, type VoiceRequestTemplate } from './request-template.js';
import { audioExtension } from './provider-audio.js';
import { VoiceError } from './provider-types.js';

export interface VoiceTemplateValues {
  text?: string | undefined;
  voice?: string | undefined;
  model?: string | undefined;
  format?: string | undefined;
  language?: string | undefined;
  audio?: Uint8Array | undefined;
  mime?: string | undefined;
  audioBase64?: string | undefined;
  audioDataUrl?: string | undefined;
}

const MAX_RENDERED_AUDIO_BYTES = 16 * 1024 * 1024;

function boundAudioExpansion(template: VoiceRequestTemplate, values: VoiceTemplateValues): void {
  let total = 0;
  const visit = (value: unknown, url = false, multipart = false): void => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(/\{(audio|audioBase64|audioDataUrl)\}/gu)) {
        const key = match[1]!;
        const rawUpload = multipart && value === '{audio}';
        const supplied = key === 'audioDataUrl' ? values.audioDataUrl : values.audioBase64;
        const size = rawUpload
          ? (values.audio?.byteLength ?? 0)
          : supplied === undefined
            ? Math.ceil((values.audio?.byteLength ?? 0) / 3) * 4 +
              (key === 'audioDataUrl' ? 128 : 0)
            : Buffer.byteLength(supplied, 'utf8');
        total += url ? size * 3 : size;
        if (total > MAX_RENDERED_AUDIO_BYTES)
          throw new VoiceError('invalid-input', 'Rendered audio references exceed 16 MB.');
      }
    } else if (Array.isArray(value)) value.forEach((item) => visit(item, url, multipart));
    else if (value !== null && typeof value === 'object')
      Object.values(value).forEach((item) => visit(item, url, multipart));
  };
  visit(template.url, true);
  visit(template.headers);
  visit(
    template.body.kind === 'multipart' ? template.body.fields : template.body,
    false,
    template.body.kind === 'multipart',
  );
}

function audioValues(values: VoiceTemplateValues): VoiceTemplateValues {
  if (values.audio === undefined) return values;
  let encoded: string | undefined;
  const base64 = () => (encoded ??= Buffer.from(values.audio!).toString('base64'));
  return {
    ...values,
    get audioBase64() {
      return values.audioBase64 ?? base64();
    },
    get audioDataUrl() {
      return (
        values.audioDataUrl ??
        `data:${values.mime ?? 'application/octet-stream'};base64,${base64()}`
      );
    },
  };
}

function placeholder(values: VoiceTemplateValues, key: string): string | undefined {
  const value: unknown = Reflect.get(values, key === 'audio' ? 'audioBase64' : key);
  if (typeof value === 'string') return value;
  return undefined;
}

function substitute(
  value: string,
  values: VoiceTemplateValues,
  encode = false,
): string | undefined {
  const exact = /^\{([A-Za-z]+)\}$/u.exec(value);
  if (exact && exact[1] !== 'audio' && placeholder(values, exact[1]!) === undefined)
    return undefined;
  return value.replace(/\{([A-Za-z]+)\}/gu, (_match, key: string) => {
    const replacement = placeholder(values, key);
    if (typeof replacement !== 'string')
      throw new VoiceError('invalid-input', `The template requires ${key}.`);
    return encode ? encodeURIComponent(replacement) : replacement;
  });
}

function expand(value: unknown, values: VoiceTemplateValues): unknown {
  if (typeof value === 'string') return substitute(value, values);
  if (Array.isArray(value)) return value.map((item) => expand(item, values));
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, expand(item, values)])
        .filter(([, item]) => item !== undefined),
    );
  return value;
}

function xmlEscape(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!,
  );
}

function serializeSsml(node: SsmlNode, values: VoiceTemplateValues): string {
  const attributes = Object.entries(node.attributes)
    .map(([name, value]) => {
      const rendered = substitute(value, values);
      return rendered === undefined ? '' : ` ${name}="${xmlEscape(rendered)}"`;
    })
    .join('');
  const children = node.children
    .map((child) =>
      typeof child === 'string'
        ? xmlEscape(substitute(child, values) ?? '')
        : serializeSsml(child, values),
    )
    .join('');
  return `<${node.tag}${attributes}>${children}</${node.tag}>`;
}

function setHeader(headers: Headers, name: string, value: string): void {
  try {
    headers.set(name, value);
  } catch {
    throw new VoiceError(
      'invalid-input',
      'A rendered template header is invalid. Check its placeholders and authentication prefix.',
    );
  }
}

export function templateRequest(
  template: VoiceRequestTemplate,
  values: VoiceTemplateValues,
  key: string | undefined,
) {
  boundAudioExpansion(template, values);
  values = audioValues(values);
  const fixed = templateUrl(template.url);
  const pathAndQuery = /^https?:\/\/[^/?#]+(.*)$/iu.exec(template.url)?.[1] ?? '';
  const url = new URL(fixed.origin + substitute(pathAndQuery, values, true)!);
  if (url.origin !== fixed.origin)
    throw new VoiceError('invalid-input', 'Template placeholders cannot change the origin.');
  const headers = new Headers();
  for (const [name, value] of Object.entries(template.headers)) {
    const rendered = substitute(value, values);
    if (rendered !== undefined) setHeader(headers, name, rendered);
  }
  if (template.auth.kind !== 'none' && key !== undefined) {
    if (template.auth.kind === 'query') url.searchParams.set(template.auth.name, key);
    else if (template.auth.kind === 'bearer') setHeader(headers, 'Authorization', `Bearer ${key}`);
    else setHeader(headers, template.auth.name, `${template.auth.prefix}${key}`);
  }
  let body: BodyInit | undefined;
  if (template.body.kind === 'json') {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(expand(template.body.value, values));
  } else if (template.body.kind === 'ssml') {
    headers.set('Content-Type', 'application/ssml+xml');
    body = serializeSsml(template.body.root, values);
  } else if (template.body.kind === 'multipart') {
    headers.delete('Content-Type');
    const form = new FormData();
    for (const [name, value] of Object.entries(template.body.fields)) {
      if (value === '{audio}') {
        if (values.audio === undefined)
          throw new VoiceError('invalid-input', 'The template requires audio.');
        form.append(
          name,
          new Blob([Uint8Array.from(values.audio)], {
            type: values.mime ?? 'application/octet-stream',
          }),
          `speech.${audioExtension(values.mime ?? '')}`,
        );
      } else {
        const rendered = substitute(value, values);
        if (rendered !== undefined) form.append(name, rendered);
      }
    }
    body = form;
  }
  return {
    url: url.href,
    init: {
      method: template.method,
      headers: Object.fromEntries(headers),
      ...(body === undefined ? {} : { body }),
    },
  };
}
