import type {
  VoiceRequestTemplate,
  VoiceTemplateValidation,
  VoiceSsmlNode as SsmlNode,
} from '@botharness/host-protocol/voice-request-template';
export type {
  VoiceRequestTemplate,
  VoiceTemplateValidation,
  VoiceSsmlNode as SsmlNode,
} from '@botharness/host-protocol/voice-request-template';
import { z } from 'zod';
import { VoiceError } from './provider-types.js';

const field = z.string().max(16_384);
const headerValue = z
  .string()
  .max(16_384)
  .regex(/^[\t\x20-\x7e\x80-\xff]*$/u, 'Header values must contain valid HTTP bytes.');

export function templateUrl(value: string): URL {
  if (!/^https?:\/\/[^/?#\\\s{}]+(?:[/?]|$)/iu.test(value) || /[\\\s]/u.test(value))
    throw new VoiceError('invalid-input', 'Use an HTTP(S) URL without credentials or fragment.');
  const url = new URL(value);
  if (url.username || url.password || url.hash || /[{}]/u.test(url.origin))
    throw new VoiceError('invalid-input', 'Use an HTTP(S) URL without credentials or fragment.');
  return url;
}
const name = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_.:-]*$/u)
  .max(100);
const headerName = z
  .string()
  .regex(/^[!#$%&'*+.^_`|~A-Za-z0-9-]+$/u)
  .max(100);
const path = z
  .string()
  .regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/u)
  .max(300);
const json = z.json();
const ssml: z.ZodType<SsmlNode> = z.lazy(() =>
  z
    .object({
      tag: name,
      attributes: z.record(name, field).default({}),
      children: z.array(z.union([field, ssml])).max(100),
    })
    .strict(),
);

export const voiceRequestTemplateSchema = z
  .object({
    version: z.literal(1),
    url: z.string().min(1).max(2_000),
    method: z.enum(['POST', 'GET']),
    auth: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('none') }).strict(),
      z.object({ kind: z.literal('bearer') }).strict(),
      z
        .object({
          kind: z.literal('header'),
          name: headerName,
          prefix: headerValue.max(100).default(''),
        })
        .strict(),
      z.object({ kind: z.literal('query'), name }).strict(),
    ]),
    headers: z.record(headerName, headerValue).default({}),
    body: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('none') }).strict(),
      z.object({ kind: z.literal('json'), value: json }).strict(),
      z.object({ kind: z.literal('ssml'), root: ssml }).strict(),
      z.object({ kind: z.literal('multipart'), fields: z.record(name, field) }).strict(),
    ]),
    result: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('audio') }).strict(),
      z.object({ kind: z.literal('base64'), path }).strict(),
      z.object({ kind: z.literal('hex'), path }).strict(),
      z.object({ kind: z.literal('url'), path }).strict(),
      z.object({ kind: z.literal('text'), path }).strict(),
    ]),
  })
  .strict()
  .superRefine((template, ctx) => {
    if (template.method === 'GET' && template.body.kind !== 'none')
      ctx.addIssue({ code: 'custom', path: ['body'], message: 'GET requests cannot have a body.' });
    try {
      templateUrl(template.url);
    } catch {
      ctx.addIssue({
        code: 'custom',
        path: ['url'],
        message: 'Use an HTTP(S) URL without credentials or fragment.',
      });
    }
    if (
      template.auth.kind === 'header' &&
      (/^(host|content-length|cookie|proxy-authorization)$/iu.test(template.auth.name) ||
        (template.body.kind !== 'none' && /^content-type$/iu.test(template.auth.name)))
    )
      ctx.addIssue({
        code: 'custom',
        path: ['auth', 'name'],
        message: 'This transport header cannot be used for authentication.',
      });
    const allowed = new Set(
      template.result.kind === 'text'
        ? ['model', 'format', 'language', 'audio', 'audioBase64', 'audioDataUrl']
        : ['text', 'voice', 'model', 'format', 'language'],
    );
    const scan = (value: unknown, parts: (string | number)[], depth = 0) => {
      if (depth > 16) {
        ctx.addIssue({
          code: 'custom',
          path: parts,
          message: 'Template nesting exceeds 16 levels.',
        });
        return;
      }
      if (typeof value === 'string') {
        for (const match of value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu))
          if (!allowed.has(match[1]!))
            ctx.addIssue({
              code: 'custom',
              path: parts,
              message: 'Unknown or unavailable placeholder for this provider kind.',
            });
      } else if (Array.isArray(value))
        value.forEach((item, index) => scan(item, [...parts, index], depth + 1));
      else if (value !== null && typeof value === 'object')
        for (const [key, item] of Object.entries(value)) scan(item, [...parts, key], depth + 1);
    };
    scan(template.url, ['url']);
    scan(template.headers, ['headers']);
    scan(template.body, ['body']);
    for (const key of Object.keys(template.headers))
      if (
        /^(authorization|proxy-authorization|cookie|host|content-length|xi-api-key|api-key|x-api-key|ocp-apim-subscription-key)$/iu.test(
          key,
        ) ||
        (template.auth.kind === 'header' && key.toLowerCase() === template.auth.name.toLowerCase())
      )
        ctx.addIssue({
          code: 'custom',
          path: ['headers', key],
          message: 'Set the key under Authentication instead; the Host manages this header.',
        });
    if (Buffer.byteLength(JSON.stringify(template), 'utf8') > 65_536)
      ctx.addIssue({ code: 'custom', message: 'Template exceeds 64 KB.' });
  }) satisfies z.ZodType<VoiceRequestTemplate>;

export function validateVoiceTemplate(
  input: unknown,
  kind: 'tts' | 'asr',
): VoiceTemplateValidation {
  try {
    const serialized = JSON.stringify(input);
    if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > 65_536)
      return {
        valid: false,
        errors: [{ path: '', message: 'Template must be JSON up to 64 KB.' }],
      };
    const pending = [{ value: input, depth: 0 }];
    while (pending.length > 0) {
      const item = pending.pop()!;
      if (item.depth > 16)
        return {
          valid: false,
          errors: [{ path: 'body', message: 'Template nesting exceeds 16 levels.' }],
        };
      if (item.value !== null && typeof item.value === 'object')
        for (const value of Object.values(item.value))
          pending.push({ value, depth: item.depth + 1 });
    }
  } catch {
    return { valid: false, errors: [{ path: '', message: 'Template must be bounded JSON.' }] };
  }
  const parsed = voiceRequestTemplateSchema.safeParse(input);
  if (!parsed.success)
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  if ((kind === 'asr') !== (parsed.data.result.kind === 'text'))
    return {
      valid: false,
      errors: [{ path: 'result', message: 'ASR requires a text result; TTS requires audio.' }],
    };
  return { valid: true, template: parsed.data };
}

export function parseVoiceTemplate(input: unknown, kind: 'tts' | 'asr'): VoiceRequestTemplate {
  const result = validateVoiceTemplate(input, kind);
  if (!result.valid)
    throw new VoiceError(
      'invalid-input',
      result.errors.map((error) => `${error.path}: ${error.message}`).join('; '),
    );
  return result.template;
}
