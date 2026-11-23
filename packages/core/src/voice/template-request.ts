import type { SsmlNode, VoiceRequestTemplate } from './request-template.js';
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

function placeholder(values: VoiceTemplateValues, key: string): string | undefined {
  const value: unknown = Reflect.get(values, key);
  if (typeof value === 'string') return value;
  if (values.audio !== undefined && ['audio', 'audioBase64', 'audioDataUrl'].includes(key)) {
    const encoded = Buffer.from(values.audio).toString('base64');
    return key === 'audioDataUrl'
      ? `data:${values.mime ?? 'application/octet-stream'};base64,${encoded}`
      : encoded;
  }
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
  const url = new URL(substitute(template.url, values, true)!);
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
