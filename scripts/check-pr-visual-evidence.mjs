import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const GUIDE =
  'https://github.com/BotHarness/DeepSeekBot/blob/main/docs/agents/pr-ui-visual-evidence.md';
const EXEMPT_TITLE = /^(?:chore\(release\)|Revert ")/u;
const IMAGE = /<img\b[^>]*>|!?\[([^\]\n]*)\]\(https:\/\/media\.botharness\.ai\/[^\s)]+\)/giu;
const THEME = { light: /\blight\b|浅色|亮色/iu, dark: /\bdark\b|深色|暗色/iu };
const MATCHING =
  'Use image alt text, Markdown link text, the same line, the nearest preceding heading, or an adjacent non-empty caption within 3 lines (light/dark, 浅色/深色, 亮色/暗色; case-insensitive).';

export function touchesUI(path) {
  if (/(?:^|\/)(?:__tests__|tests?|__mocks__)(?:\/|$)|\.(?:test|spec)\.[^/]+$/iu.test(path))
    return false;
  if (/^apps\/mobile\/(?:src\/ui|app)\//u.test(path)) return true;
  if (!path.startsWith('packages/client/src/client/')) return false;
  return (
    /\.tsx$/u.test(path) ||
    path.startsWith('packages/client/src/client/ds/') ||
    /[^/]*styles[^/]*\.ts$/u.test(path)
  );
}

function evidence(body) {
  const records = [];
  for (const match of body.matchAll(IMAGE)) {
    const tag = match[0];
    if (
      tag.startsWith('<') &&
      !/\bsrc\s*=\s*(["'])https:\/\/media\.botharness\.ai\/[^\s"'<>]+\1/iu.test(tag)
    )
      continue;
    const preceding = body.slice(0, match.index).split(/\r?\n/u);
    const following = body.slice(match.index + tag.length).split(/\r?\n/u);
    const heading = preceding.findLast((line) => /^\s*#{1,6}\s/u.test(line)) ?? '';
    const captions = [preceding.slice(-4, -1).reverse(), following.slice(1, 4)].map((lines) => {
      const adjacent = lines.find((line) => line.trim());
      return adjacent &&
        !/^\s*#{1,6}\s|<img\b|!?\[[^\]]*\]\(https:\/\/media\.botharness\.ai\//iu.test(adjacent)
        ? adjacent
        : '';
    });
    const text = tag.startsWith('<')
      ? (/\balt\s*=\s*(["'])(.*?)\1/isu.exec(tag)?.[2] ?? '')
      : match[1];
    const inline = [preceding.at(-1), following[0]].join(' ').replace(IMAGE, '');
    records.push([text, heading, inline, ...captions].join(' '));
  }
  return records;
}

const REVIEW_ITEMS = [
  ['Object/state/next action recognisable', '对象、状态和下一步操作清晰可辨'],
  ['Every description adds a needed fact', '每段描述都补充必要信息'],
  ['Both themes checked', '已检查浅色和深色主题'],
  ['Maintained languages checked', '已检查维护的语言'],
];
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

function reviewProblems(body) {
  const section = /^#{2,6}\s+UI review(?:\s*\/\s*UI 评审)?\s*$/imu.exec(body);
  if (!section)
    return [
      `Add the "UI review" section from .github/pull_request_template.md and answer all four items. See ${GUIDE}.`,
    ];
  const lines = body.slice(section.index + section[0].length).split(/\r?\n/u);
  const end = lines.findIndex((line) => /^#{1,6}\s/u.test(line));
  const content = lines.slice(0, end < 0 ? undefined : end);
  return REVIEW_ITEMS.flatMap(([english, chinese]) => {
    const item = new RegExp(
      `^\\s*[-*]\\s+(?:\\[([ x])\\]\\s+)?(?:${escape(english)}(?:\\s*/\\s*${escape(chinese)})?|${escape(chinese)})[.。]?(.*)$`,
      'iu',
    );
    const answered = content.some((line) => {
      const match = item.exec(line);
      return (
        match && (match[1]?.toLowerCase() === 'x' || match[2].replace(/^[\s:：.—-]+/u, '').trim())
      );
    });
    return answered
      ? []
      : [
          `Answer UI review item "${english}": check its box (- [x]) or add an explanation after the item (for example, ": checked English and Chinese"). See ${GUIDE}.`,
        ];
  });
}

export function problems({ title = '', body = '', author = '', files = [], labels = [] }) {
  if (
    author.endsWith('[bot]') ||
    EXEMPT_TITLE.test(title.trim()) ||
    labels.includes('no-visual-change') ||
    !files.some(touchesUI)
  )
    return [];
  const errors = [];
  const content = body
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gmu, '');
  const records = evidence(content);
  for (const [theme, pattern] of Object.entries(THEME))
    if (!records.some((text) => pattern.test(text)))
      errors.push(
        `Add ${theme} visual evidence: an <img src="https://media.botharness.ai/…"> or [text](https://media.botharness.ai/…) image reference. ${MATCHING} See ${GUIDE}.`,
      );
  for (const label of ['Before', 'After'])
    if (!records.some((text) => new RegExp(`\\b${label}\\b`, 'iu').test(text)))
      errors.push(`Add the "${label}" label near visual evidence. ${MATCHING} See ${GUIDE}.`);
  return [...errors, ...reviewProblems(content)];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { values } = parseArgs({
    options: {
      title: { type: 'string', default: '' },
      'body-file': { type: 'string' },
      author: { type: 'string', default: '' },
      'files-file': { type: 'string' },
      labels: { type: 'string', default: '' },
    },
  });
  const errors = problems({
    title: values.title,
    body: values['body-file'] ? readFileSync(values['body-file'], 'utf8') : '',
    author: values.author,
    files: values['files-file']
      ? readFileSync(values['files-file'], 'utf8').split(/\r?\n/u).filter(Boolean)
      : [],
    labels: values.labels.split(',').map((label) => label.trim()),
  });
  if (errors.length) {
    console.error(
      `PR visual evidence:\n  ${errors.join('\n  ')}\nEdit the PR description; this check reruns on edit. Use no-visual-change only when the UI paths have no visual change (see ${GUIDE}).`,
    );
    process.exitCode = 1;
  } else console.log('PR visual evidence and UI review: passed or exempt');
}
