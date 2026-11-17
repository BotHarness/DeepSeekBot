#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const REFERENCE = /\b(?:Closes|Fixes|Resolves|Refs)\s+(?:[\w.-]+\/[\w.-]+)?#\d+\b/i;
const LINK = /\[[^\]]*\]\([^)]*\)/gu;
const FIELDS = [
  {
    label: 'Merge risk',
    placeholder: 'reversibility, blast radius and review focus',
    fix: 'say how to revert, what it can break and where review should look',
  },
  {
    label: 'Verification',
    placeholder: 'list exact checks and results',
    fix: 'list the checks you ran with their results, and what was not run',
  },
];
const TEMPLATE_TEXT = [
  'Explain the user problem in one sentence',
  'Show the smallest useful before/after or structural outline',
];
const EXEMPT_TITLE = /^(?:chore\(release\)|Revert ")/u;

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

export function field(body, label) {
  const lines = body.split(/\r?\n/u);
  const start = new RegExp(
    `^\\s*(?:[-*]\\s+|#{2,6}\\s+)?(?:\\*\\*|__)?${escape(label)}(?:\\*\\*|__)?\\s*[:：.]?\\s*(?:\\*\\*|__)?\\s*(.*)$`,
    'iu',
  );
  const index = lines.findIndex((line) => start.test(line));
  if (index === -1) return undefined;
  const parts = [start.exec(lines[index])[1].trim()];
  for (const line of lines.slice(index + 1)) {
    if (/^(?:#{1,6}\s|[-*]\s+(?:\*\*|__)?[A-Z][\w /-]{2,30}(?:\*\*|__)?\s*[:：.])/u.test(line))
      break;
    if (line.trim() === '' && parts.join('').trim() !== '') break;
    parts.push(line.trim());
  }
  return parts.join(' ').trim();
}

export function problems({ title = '', body = '', author = '' }) {
  if (author.endsWith('[bot]') || EXEMPT_TITLE.test(title.trim())) return [];
  const errors = [];
  const plain = body.replace(LINK, '');
  if (!REFERENCE.test(plain))
    errors.push(
      REFERENCE.test(body)
        ? 'Write `Closes #N` or `Refs #N` as plain text; GitHub ignores it inside a Markdown link.'
        : 'Name the issue: `Closes #N` when this PR delivers it, `Refs #N` when part is still unbuilt.',
    );
  for (const { label, placeholder, fix } of FIELDS) {
    const value = field(body, label);
    if (value === undefined || value === '')
      errors.push(`Add a \`${label}:\` line under "Special things to note": ${fix}.`);
    else if (value.toLowerCase().startsWith(placeholder.toLowerCase()))
      errors.push(`Replace the template text after \`${label}:\`: ${fix}.`);
  }
  for (const text of TEMPLATE_TEXT)
    if (body.includes(text))
      errors.push(`Replace the template text "${text}…" with this PR's own.`);
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { values } = parseArgs({
    options: {
      title: { type: 'string', default: '' },
      'body-file': { type: 'string' },
      author: { type: 'string', default: '' },
    },
  });
  const body = values['body-file'] ? readFileSync(values['body-file'], 'utf8') : '';
  const errors = problems({ title: values.title, body, author: values.author });
  if (errors.length) {
    console.error(
      `PR body (.github/pull_request_template.md):\n  ${errors.join('\n  ')}\nEdit the PR description; this check reruns on edit.`,
    );
    process.exitCode = 1;
  } else console.log('PR body: issue reference, merge risk and verification present');
}
