import type {
  VoiceRequestTemplate,
  VoiceTemplateValidation,
} from '@botharness/host-protocol/voice-request-template';

import { answerRecord, HostAnswerInvalid, record, type HostCall } from './host-answer';
import {
  voiceServiceRecord,
  voiceServiceView,
  type VoiceKind,
  type VoiceServiceView,
} from './voice-providers';

function stringMap(value: unknown): boolean {
  const map = record(value);
  return map !== undefined && Object.values(map).every((entry) => typeof entry === 'string');
}

function authOk(value: unknown): boolean {
  const auth = record(value);
  if (auth?.['kind'] === 'none' || auth?.['kind'] === 'bearer') return true;
  if (auth?.['kind'] === 'query') return typeof auth['name'] === 'string';
  return (
    auth?.['kind'] === 'header' &&
    typeof auth['name'] === 'string' &&
    typeof auth['prefix'] === 'string'
  );
}

function ssmlOk(value: unknown, depth = 0): boolean {
  const node = record(value);
  return (
    depth < 32 &&
    node !== undefined &&
    typeof node['tag'] === 'string' &&
    stringMap(node['attributes']) &&
    Array.isArray(node['children']) &&
    node['children'].every((child) => typeof child === 'string' || ssmlOk(child, depth + 1))
  );
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function jsonOk(value: unknown, depth = 0): boolean {
  if (depth >= 32) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((entry) => jsonOk(entry, depth + 1));
  return plainObject(value) && Object.values(value).every((entry) => jsonOk(entry, depth + 1));
}

function bodyOk(value: unknown): boolean {
  const body = record(value);
  if (body?.['kind'] === 'none') return true;
  if (body?.['kind'] === 'json') return 'value' in body && jsonOk(body['value']);
  if (body?.['kind'] === 'ssml') return ssmlOk(body['root']);
  return body?.['kind'] === 'multipart' && stringMap(body['fields']);
}

function resultOk(value: unknown): boolean {
  const result = record(value);
  if (result?.['kind'] === 'audio') return true;
  return (
    ['base64', 'hex', 'url', 'text'].includes(result?.['kind'] as string) &&
    typeof result?.['path'] === 'string'
  );
}

export function isVoiceTemplate(value: unknown, kind?: VoiceKind): value is VoiceRequestTemplate {
  const template = record(value);
  return (
    template !== undefined &&
    template['version'] === 1 &&
    typeof template['url'] === 'string' &&
    (template['method'] === 'POST' || template['method'] === 'GET') &&
    stringMap(template['headers']) &&
    authOk(template['auth']) &&
    bodyOk(template['body']) &&
    resultOk(template['result']) &&
    (kind === undefined || (kind === 'asr') === (record(template['result'])?.['kind'] === 'text'))
  );
}

export function voiceTemplateOf(
  value: unknown,
  method: string,
  kind?: VoiceKind,
): VoiceRequestTemplate {
  if (!isVoiceTemplate(value, kind)) throw new HostAnswerInvalid(`invalid ${method} response`);
  return value;
}

export async function validateVoiceTemplate(
  host: HostCall,
  kind: VoiceKind,
  template: unknown,
): Promise<VoiceTemplateValidation> {
  const method = 'voiceTemplateValidate';
  const answer = answerRecord(await host.call(method, { kind, template }), method);
  if (answer['valid'] === true)
    return { valid: true, template: voiceTemplateOf(answer['template'], method, kind) };
  if (answer['valid'] !== false || !Array.isArray(answer['errors']))
    throw new HostAnswerInvalid(`invalid ${method} response`);
  return {
    valid: false,
    errors: answer['errors'].map((entry) => {
      const error = record(entry);
      if (error === undefined) throw new HostAnswerInvalid(`invalid ${method} response`);
      return {
        path: typeof error['path'] === 'string' ? error['path'] : '',
        message: typeof error['message'] === 'string' ? error['message'] : '',
      };
    }),
  };
}

export async function readVoiceServiceTemplate(
  host: HostCall,
  id: string,
): Promise<VoiceRequestTemplate> {
  const method = 'voiceProviderTemplate';
  return voiceTemplateOf(answerRecord(await host.call(method, { id }), method)['template'], method);
}

export async function setVoiceServiceTemplateAnswer(
  host: HostCall,
  id: string,
  template: VoiceRequestTemplate,
): Promise<Record<string, unknown>> {
  const method = 'voiceProviderTemplateSet';
  return voiceServiceRecord(
    answerRecord(await host.call(method, { id, template }), method)['provider'],
    method,
  );
}

export async function setVoiceServiceTemplate(
  host: HostCall,
  id: string,
  template: VoiceRequestTemplate,
): Promise<VoiceServiceView> {
  return voiceServiceView(await setVoiceServiceTemplateAnswer(host, id, template));
}
