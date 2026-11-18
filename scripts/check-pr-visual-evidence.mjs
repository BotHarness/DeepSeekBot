#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { field } from './pr-body-field.mjs';

const UI_PATH =
  /^(?:packages\/client\/src\/client\/.+\.(?:tsx|css)|packages\/client\/src\/client\/(?:.+\/)?(?:styles?|[\w-]+\.stylex)(?:[\w.-]*)?\.ts|apps\/mobile\/src\/ui\/.+|apps\/mobile\/app\/.+)$/u;
const TEST_PATH = /(?:^|\/)(?:test|tests|__tests__)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const EXEMPT_LABEL = 'no-visual-change';
const EXEMPT_TITLE = /^(?:chore\(release\)|Revert ")/u;
const MEDIA_HOST = 'https://media.botharness.ai/';
const MEDIA =
  /https:\/\/media\.botharness\.ai\/pr\/[\w./-]+?\.(?:png|jpe?g|gif|webp|avif|mp4|webm|mov)\b/giu;
const HAS_MEDIA = /https:\/\/media\.botharness\.ai\/pr\//iu;
const HEADING = /^#{1,6}\s/u;
const TABLE_ROW = /^\s*\|/u;
const LIGHT = /\blight\b|浅色|亮色/iu;
const DARK = /\bdark\b|深色|暗色/iu;
const BEFORE = /\bbefore\b|改前|修改前|之前/iu;
const AFTER = /\bafter\b|改后|修改后|之后/iu;
const REVIEW_PLACEHOLDER = 'for UI PRs, answer the review gate';
const GUIDE = 'docs/agents/pr-ui-visual-evidence.md';

export function uiPaths(paths) {
  return [...new Set(paths)].filter((path) => UI_PATH.test(path) && !TEST_PATH.test(path));
}

function tableHeader(lines, index) {
  if (!TABLE_ROW.test(lines[index])) return '';
  let at = index;
  while (at > 0 && TABLE_ROW.test(lines[at - 1])) at -= 1;
  return at < index ? lines[at] : '';
}

function heading(lines, index) {
  for (let at = index - 1; at >= 0; at -= 1) if (HEADING.test(lines[at])) return lines[at];
  return '';
}

function captions(lines, index) {
  const above = [];
  for (let at = index - 1; at >= 0 && above.length < 3; at -= 1) {
    const text = lines[at].trim();
    if (!text) continue;
    if (HAS_MEDIA.test(text) || HEADING.test(text)) break;
    above.unshift(text);
  }
  return above;
}

export function evidenceImages(body) {
  const lines = (body ?? '').split(/\r?\n/u);
  return lines.flatMap((line, index) => {
    const urls = [...line.matchAll(MEDIA)].map((match) => match[0]);
    if (!urls.length) return [];
    const context = [
      heading(lines, index),
      tableHeader(lines, index),
      ...captions(lines, index),
      line.replace(MEDIA, ' '),
    ].join(' ');
    const light = LIGHT.test(context);
    const dark = DARK.test(context);
    return urls.map((url) => ({ url, light, dark }));
  });
}

export function problems({ title = '', body = '', author = '', labels = [], paths = [] }) {
  if (author.endsWith('[bot]') || EXEMPT_TITLE.test(title.trim())) return [];
  if (labels.includes(EXEMPT_LABEL)) return [];
  const touched = uiPaths(paths);
  if (!touched.length) return [];
  const errors = [];
  const images = evidenceImages(body);
  if (!images.length)
    errors.push(
      `Embed light and dark Before/After screenshots from ${MEDIA_HOST} in "Change outline" (pnpm evidence:publish), or add the \`${EXEMPT_LABEL}\` label when nothing renders differently.`,
    );
  else {
    if (!images.some((image) => image.light))
      errors.push(
        'Add a light-theme screenshot: put "Light" (or 浅色) in its heading, caption or alt text.',
      );
    if (!images.some((image) => image.dark))
      errors.push(
        'Add a dark-theme screenshot: put "Dark" (or 深色) in its heading, caption or alt text.',
      );
  }
  if (images.length && !(BEFORE.test(body) && AFTER.test(body)))
    errors.push(
      'Label the screenshots Before and After (改前/改后) so reviewers can compare them.',
    );
  const review = field(body, 'Design review');
  if (review === undefined || review === '')
    errors.push(
      'Add a `Design review:` line under "Special things to note": say how the object, state and next action read, that each description adds a needed fact, and which themes and languages you checked.',
    );
  else if (review.toLowerCase().startsWith(REVIEW_PLACEHOLDER.toLowerCase()))
    errors.push('Replace the template text after `Design review:` with your answers.');
  return errors;
}

export function report(errors, paths) {
  const touched = uiPaths(paths);
  const shown = touched.slice(0, 5).join(', ') + (touched.length > 5 ? ', …' : '');
  return `PR visual evidence (${GUIDE}). UI files changed: ${shown}\n  ${errors.join('\n  ')}\nEdit the PR description or labels; this check reruns on edit.`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { values } = parseArgs({
    options: {
      title: { type: 'string', default: '' },
      'body-file': { type: 'string' },
      'paths-file': { type: 'string' },
      author: { type: 'string', default: '' },
      labels: { type: 'string', default: '' },
    },
  });
  const read = (file) => (file ? readFileSync(file, 'utf8') : '');
  const paths = read(values['paths-file']).split(/\r?\n/u).filter(Boolean);
  const labels = values.labels
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean);
  const errors = problems({
    title: values.title,
    body: read(values['body-file']),
    author: values.author,
    labels,
    paths,
  });
  if (errors.length) {
    console.error(report(errors, paths));
    process.exitCode = 1;
  } else if (uiPaths(paths).length && !labels.includes(EXEMPT_LABEL))
    console.log(
      'PR visual evidence: light and dark Before/After screenshots and design review present',
    );
  else console.log('PR visual evidence: not required for this PR');
}
