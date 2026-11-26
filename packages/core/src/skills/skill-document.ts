import { isMap, isScalar, parse, parseDocument, type Document } from 'yaml';

export interface SkillDocument {
  name: string;
  description: string;
  content: string;
  invocation: { userInvocable: boolean; modelInvocable: boolean };
}

function booleanField(data: Record<string, unknown>, key: string): boolean | undefined {
  if (!Object.hasOwn(data, key)) return undefined;
  const value = data[key];
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  if (typeof value === 'string') {
    if (['true', 'yes', 'on'].includes(value.toLowerCase())) return true;
    if (['false', 'no', 'off'].includes(value.toLowerCase())) return false;
  }
  throw new TypeError('Invalid Skill invocation policy');
}

export function parseSkillDocument(raw: string): SkillDocument | undefined {
  const frontmatter = /^---\r?\n([\s\S]*?)^---\r?$(?:\n|$)/mu.exec(raw);
  if (frontmatter?.index !== 0) return undefined;
  let data: unknown;
  try {
    data = parse(frontmatter[1]!);
  } catch {
    return undefined;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined;
  const fields: Record<string, unknown> = Object.fromEntries(Object.entries(data));
  const { name, description } = fields;
  if (
    typeof name !== 'string' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name) ||
    typeof description !== 'string' ||
    description.length === 0 ||
    ['disableModelInvocation', 'modelInvocable', 'userInvocable'].some((key) =>
      Object.hasOwn(fields, key),
    )
  )
    return undefined;
  const disableModelInvocation = booleanField(fields, 'disable-model-invocation');
  return {
    name,
    description,
    content: raw.slice(frontmatter[0].length).trim(),
    invocation: {
      userInvocable: booleanField(fields, 'user-invocable') !== false,
      modelInvocable: disableModelInvocation !== true,
    },
  };
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)^---\r?$(?:\n|$)/mu;

function editFrontmatter(text: string, edit: (document: Document) => void): string {
  const source = text.replace(/^﻿/u, '');
  const match = FRONTMATTER.exec(source);
  if (match?.index !== 0) return text;
  const document = parseDocument(match[1]!, { uniqueKeys: false });
  if (document.errors.length > 0 || !isMap(document.contents)) return text;
  edit(document);
  return `---\n${document.toString()}---\n${source.slice(match[0].length)}`;
}

export function renameSkillDocument(text: string, name: string): string {
  return editFrontmatter(text, (document) => document.set('name', name));
}

export function withSkillDocumentMetadata(text: string, entries: Record<string, string>): string {
  return editFrontmatter(text, (document) => {
    const metadata = document.get('metadata', true);
    const map = isMap(metadata) ? metadata : document.createNode({});
    for (const item of [...map.items])
      if (isScalar(item.key) && String(item.key.value).startsWith('tobs-')) map.delete(item.key);
    const fresh = Object.entries(entries).map(([key, value]) =>
      document.createPair(`tobs-${key}`, value),
    );
    map.items.unshift(...fresh);
    for (const pair of fresh) {
      if (isScalar(pair.value)) pair.value.type = 'QUOTE_DOUBLE';
    }
    document.set('metadata', map);
  });
}
