import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const count = Number(process.argv[2] ?? 240);
const out = process.argv[3];
if (!Number.isInteger(count) || count < 1 || !out)
  throw new Error('Usage: android-chat-perf-workload.mjs <count> <out.jsonl>');

let seed = 3957;
const next = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = (items) => items[Math.floor(next() * items.length)];
const range = (low, high) => low + Math.floor(next() * (high - low + 1));

const words = [
  'latency',
  'frame',
  'render',
  'history',
  'anchor',
  'stream',
  'bubble',
  'layout',
  'scroll',
  'measure',
  'native',
  'thread',
  'budget',
  'cache',
  'window',
  'commit',
  'reply',
  'message',
];
const chinese = [
  '这一段用来测试长消息的排版与滚动。',
  '历史分页时需要保持当前阅读位置不变。',
  '表格和代码块会让单条消息变得很高。',
  '返回最新消息时首帧就应该看到内容。',
  '流式输出的同时用户可能在阅读历史。',
];

const sentence = () => {
  const length = range(6, 18);
  const text = Array.from({ length }, () => pick(words)).join(' ');
  return text[0].toUpperCase() + text.slice(1) + '.';
};
const paragraph = () =>
  Array.from({ length: range(2, 5) }, () => (next() < 0.35 ? pick(chinese) : sentence())).join(' ');

const code = (index) => {
  const lines = range(20, 60);
  const body = Array.from(
    { length: lines },
    (_, i) => `  const value${i} = measure(rows[${i}], ${range(1, 99)}); // row ${index}-${i}`,
  );
  return [
    '```ts',
    `function sample${index}(rows: number[]) {`,
    ...body,
    '  return rows.length;',
    '}',
    '```',
  ].join('\n');
};

const table = (index) => {
  const rows = range(10, 30);
  return [
    '| Case | Frames | P95 ms | Notes |',
    '| --- | ---: | ---: | --- |',
    ...Array.from(
      { length: rows },
      (_, i) =>
        `| ${index}-${i} | ${range(80, 1400)} | ${(range(80, 340) / 10).toFixed(1)} | ${pick(words)} ${pick(words)} |`,
    ),
  ].join('\n');
};

const list = () =>
  Array.from({ length: range(3, 9) }, (_, i) => `${i + 1}. **${pick(words)}** ${sentence()}`).join(
    '\n',
  );

const kinds = [
  [0.3, () => sentence()],
  [0.22, () => Array.from({ length: range(2, 4) }, paragraph).join('\n\n')],
  [0.12, () => `${paragraph()}\n\n${list()}`],
  [0.12, (i) => `## Report ${i}\n\n${paragraph()}\n\n${table(i)}`],
  [0.12, (i) => `${sentence()}\n\n${code(i)}\n\n${sentence()}`],
  [
    0.07,
    () =>
      `${paragraph()}\n\n> ${sentence()}\n\nSee [docs](https://botharness.ai/docs) and \`inline ${pick(words)}\`.`,
  ],
  [0.05, (i) => `## Long ${i}\n\n${table(i)}\n\n${code(i)}\n\n${list()}`],
];

const messages = Array.from({ length: count }, (_, i) => {
  let roll = next();
  for (const [weight, make] of kinds) {
    if (roll < weight)
      return { index: i, body: `${make(i)}\n\nPERF3957-${String(i).padStart(3, '0')}` };
    roll -= weight;
  }
  return { index: i, body: `${sentence()}\n\nPERF3957-${String(i).padStart(3, '0')}` };
});

const text = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
writeFileSync(out, text);
console.log(
  JSON.stringify({
    count,
    out,
    sha256: createHash('sha256').update(text).digest('hex'),
    characters: messages.reduce((sum, m) => sum + m.body.length, 0),
    tables: messages.filter((m) => m.body.includes('| --- |')).length,
    code: messages.filter((m) => m.body.includes('```')).length,
  }),
);
