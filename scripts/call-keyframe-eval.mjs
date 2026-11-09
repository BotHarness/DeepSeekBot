#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

export const usage = `Usage: node scripts/call-keyframe-eval.mjs [options]

Generate six call videos with known ground truth (VC8, #3499), run the shared keyframe picker
over them and judge each case automatically. With --bot it also drives every case through a
real Host call (deepseekbot call-simulate --screen/--video plus a typed question) and judges
the Bot's spoken answer, so the model must be the latest DeepSeek model (opencode-go).

Cases: reading, scroll, windows, movie, camera, silence (5 minutes, then a question).

Options:
  --case <id>          Run only this case (repeatable).
  --compare            Also sweep the grayscale pixel difference against a perceptual hash
                       (pHash) over several thresholds and print which settings pass every case.
  --bot <id>           Live: call this Bot on the Host (otherwise the picker runs offline only).
  --name <instance>    verify-app instance whose Host to call (default vc8), read from
                       .humanlayer/verify/<name>/instance.json; DEEPSEEKBOT_HOST and
                       DEEPSEEKBOT_HOST_TOKEN in the environment take precedence.
  --stub-voice         Live: start a local stand-in ASR/TTS endpoint and bind it to the Bot, for
                       an isolated Host without real voice Providers. Questions are typed, so
                       recognition is never needed, and replies play as silence of speech length.
  --reply-wait <s>     Seconds to wait for each answer (default 150).
  --out <dir>          Report folder (default .humanlayer/call-keyframe-eval/<time>/): fixtures,
                       report.json, report.md and every grid image the Host composed.

Exit status is 1 when a selected case fails.`;

const SAMPLE_MS = 500;

export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const FONT = 'DejaVu Sans, Helvetica, Arial, sans-serif';
const MONO = 'DejaVu Sans Mono, Menlo, Consolas, monospace';
const escape = (text) =>
  String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function svgDoc(width, height, body, background = '#ffffff') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${background}"/>${body}</svg>`;
}

function windowChrome(width, height, title, body, accent = '#2f6fed') {
  return svgDoc(
    width,
    height,
    `<rect x="0" y="0" width="${width}" height="44" fill="#e9ecf1"/><circle cx="24" cy="22" r="7" fill="#ff5f57"/><circle cx="46" cy="22" r="7" fill="#febc2e"/><circle cx="68" cy="22" r="7" fill="#28c840"/><text x="${width / 2}" y="29" text-anchor="middle" font-family="${FONT}" font-size="18" fill="#333">${escape(title)}</text><rect x="0" y="44" width="6" height="${height - 44}" fill="${accent}"/>${body}`,
  );
}

const LOREM = [
  'Tide gauges along the north pier were read every morning at six.',
  'The lamp keepers logged fog, wind and the number of passing ships.',
  'Most entries are short, but storms filled several pages at a time.',
  'Volunteers copied each ledger page into the shared survey sheet.',
  'Gaps in the record line up with the two winters the pier was closed.',
];

const PAGES = [
  {
    headings: ['Background', 'Method', 'Findings'],
    paragraphs: [LOREM, [...LOREM].reverse(), LOREM.slice(1)],
  },
  {
    headings: ['Results', 'Discussion', 'Next steps'],
    paragraphs: [LOREM.slice(2), LOREM.slice(0, 4), [...LOREM].reverse().slice(1)],
  },
];

const TYPED_LINE = 'Draft approved by the harbor board on 12 May.';

function readingSvg(width, height, cursorOn, page, typed) {
  const lines = [];
  let y = 180;
  const { headings, paragraphs } = PAGES[page];
  for (const [index, paragraph] of paragraphs.entries()) {
    lines.push(
      `<text x="120" y="${y}" font-family="${FONT}" font-size="22" font-weight="bold" fill="#222">${index + 1}. ${headings[index]}</text>`,
    );
    y += 40;
    for (const line of paragraph) {
      lines.push(
        `<text x="120" y="${y}" font-family="${FONT}" font-size="20" fill="#333">${escape(line)}</text>`,
      );
      y += 30;
    }
    y += 20;
  }
  if (typed)
    lines.push(
      `<text x="120" y="${y}" font-family="${FONT}" font-size="20" fill="#333">${escape(TYPED_LINE)}</text>`,
    );
  const cursor = cursorOn ? `<rect x="738" y="${y - 52}" width="2" height="24" fill="#111"/>` : '';
  return windowChrome(
    width,
    height,
    'Harbor Lights Survey.docx',
    `<text x="120" y="120" font-family="${FONT}" font-size="40" font-weight="bold" fill="#111">Harbor Lights Survey</text>${lines.join('')}${cursor}<text x="${width - 120}" y="${height - 30}" text-anchor="end" font-family="${FONT}" font-size="18" fill="#666">Page ${page + 1} of 2</text>`,
  );
}

const CODE_LINES = 240;
const SECRET_LINE = 137;

function codeLine(number) {
  if (number === SECRET_LINE) return 'const portalSecret = "VIOLET-42";';
  const names = ['count', 'total', 'index', 'buffer', 'result', 'offset', 'limit', 'cursor'];
  const name = names[number % names.length];
  if (number % 15 === 1) return `function step${number}(${name}) {`;
  if (number % 15 === 0) return '}';
  return `  let ${name}${number} = ${name}${number - 1} + ${(number * 7) % 97}; // line ${number}`;
}

const CODE_LINE_HEIGHT = 20;
const CODE_TOP = 60;

function codeCanvasSvg(width) {
  const height = CODE_TOP + CODE_LINES * CODE_LINE_HEIGHT + 900;
  const rows = [];
  for (let number = 1; number <= CODE_LINES; number += 1) {
    const y = CODE_TOP + number * CODE_LINE_HEIGHT;
    rows.push(
      `<text x="60" y="${y}" font-family="${MONO}" font-size="14" fill="#7a8291" text-anchor="end">${number}</text><text x="80" y="${y}" font-family="${MONO}" font-size="14" fill="#1f2328">${escape(codeLine(number))}</text>`,
    );
  }
  return { svg: svgDoc(width, height, rows.join(''), '#fbfbfd'), height };
}

const WINDOWS = [
  {
    title: 'main.rs - Editor',
    body: (w) =>
      `<text x="60" y="120" font-family="${MONO}" font-size="22" fill="#1f2328">fn main() {</text><text x="60" y="160" font-family="${MONO}" font-size="22" fill="#1f2328">    println!("hello harbor");</text><text x="60" y="200" font-family="${MONO}" font-size="22" fill="#1f2328">}</text><rect x="${w - 300}" y="44" width="300" height="900" fill="#f1f3f6"/>`,
    accent: '#7c3aed',
  },
  {
    title: 'Weather in Oslo - Browser',
    body: () =>
      `<text x="80" y="160" font-family="${FONT}" font-size="64" fill="#0b5394">Oslo  -3°C</text><text x="80" y="230" font-family="${FONT}" font-size="28" fill="#333">Light snow, wind 12 km/h</text><circle cx="1100" cy="300" r="120" fill="#f4c542"/>`,
    accent: '#0b5394',
  },
  {
    title: 'Terminal - cargo test',
    body: (w, h) =>
      `<rect x="6" y="44" width="${w}" height="${h}" fill="#101418"/><text x="40" y="100" font-family="${MONO}" font-size="22" fill="#8ae234">$ cargo test</text><text x="40" y="140" font-family="${MONO}" font-size="22" fill="#d3d7cf">running 12 tests</text><text x="40" y="180" font-family="${MONO}" font-size="22" fill="#8ae234">test result: ok. 12 passed</text>`,
    accent: '#101418',
  },
  {
    title: 'Team Chat',
    body: () =>
      `<rect x="60" y="100" width="520" height="70" rx="18" fill="#e7f0ff"/><text x="90" y="145" font-family="${FONT}" font-size="24" fill="#222">Lunch at noon?</text><rect x="500" y="200" width="520" height="70" rx="18" fill="#d9fdd3"/><text x="530" y="245" font-family="${FONT}" font-size="24" fill="#222">Sure, see you there</text>`,
    accent: '#16a34a',
  },
  {
    title: 'Budget 2027 - Spreadsheet',
    body: () => {
      const cells = [];
      for (let row = 0; row < 12; row += 1)
        for (let col = 0; col < 6; col += 1)
          cells.push(
            `<rect x="${60 + col * 200}" y="${80 + row * 50}" width="200" height="50" fill="${row === 0 ? '#d9ead3' : '#ffffff'}" stroke="#c0c0c0"/><text x="${70 + col * 200}" y="${112 + row * 50}" font-family="${FONT}" font-size="20" fill="#222">${row === 0 ? ['Item', 'Q1', 'Q2', 'Q3', 'Q4', 'Total'][col] : (row * 37 + col * 11) % 900}</text>`,
          );
      return cells.join('');
    },
    accent: '#0f9d58',
  },
];

const SHOTS = [
  {
    caption: 'At dawn, an old fisherman rows his small boat out to sea.',
    scene: (w, h, pan) =>
      `<rect width="${w}" height="${h * 0.55}" fill="#f6a26b"/><circle cx="${640 + pan}" cy="${h * 0.5}" r="90" fill="#ffd27f"/><rect y="${h * 0.55}" width="${w}" height="${h * 0.45}" fill="#2a5f8f"/><path d="M ${500 + pan} ${h * 0.62} l 220 0 l -40 50 l -140 0 z" fill="#5b3a1e"/><rect x="${605 + pan}" y="${h * 0.42}" width="8" height="${h * 0.2}" fill="#5b3a1e"/>`,
  },
  {
    caption: 'In the city, a red car races through the rain.',
    scene: (w, h, pan) =>
      `<rect width="${w}" height="${h}" fill="#4a5361"/><rect y="${h * 0.65}" width="${w}" height="${h * 0.35}" fill="#2b2f36"/>${Array.from({ length: 40 }, (_, i) => `<line x1="${(i * 97 + pan * 3) % w}" y1="${(i * 53) % (h * 0.6)}" x2="${((i * 97 + pan * 3) % w) - 12}" y2="${((i * 53) % (h * 0.6)) + 40}" stroke="#c8d3e0" stroke-width="2"/>`).join('')}<rect x="${380 + pan * 2}" y="${h * 0.55}" width="420" height="110" rx="30" fill="#d62828"/><circle cx="${470 + pan * 2}" cy="${h * 0.55 + 115}" r="38" fill="#111"/><circle cx="${710 + pan * 2}" cy="${h * 0.55 + 115}" r="38" fill="#111"/>`,
  },
  {
    caption: 'The car stops at a farmhouse, and a brown dog runs to greet it.',
    scene: (w, h, pan) =>
      `<rect width="${w}" height="${h * 0.6}" fill="#9fd3f2"/><rect y="${h * 0.6}" width="${w}" height="${h * 0.4}" fill="#6aa84f"/><rect x="${150 - pan}" y="${h * 0.3}" width="320" height="230" fill="#f1e3c4"/><path d="M ${130 - pan} ${h * 0.3} l 180 -120 l 180 120 z" fill="#8b2e16"/><ellipse cx="${800 + pan}" cy="${h * 0.72}" rx="110" ry="55" fill="#8b5a2b"/><circle cx="${920 + pan}" cy="${h * 0.66}" r="45" fill="#8b5a2b"/><rect x="${740 + pan}" y="${h * 0.76}" width="20" height="70" fill="#8b5a2b"/><rect x="${850 + pan}" y="${h * 0.76}" width="20" height="70" fill="#8b5a2b"/>`,
  },
  {
    caption: 'That night a storm breaks, and lightning hits the old oak tree.',
    scene: (w, h, pan) =>
      `<rect width="${w}" height="${h}" fill="#1c2033"/><path d="M ${620 + pan} 40 l -60 200 l 70 0 l -80 220 l 160 -260 l -70 0 l 60 -160 z" fill="#fff6a8"/><rect x="${900 - pan}" y="${h * 0.45}" width="40" height="${h * 0.45}" fill="#3b2a1a"/><circle cx="${920 - pan}" cy="${h * 0.42}" r="130" fill="#1f3d1f"/>`,
  },
  {
    caption: 'By morning the storm is over, and the fisherman sees a rainbow.',
    scene: (w, h, pan) =>
      `<rect width="${w}" height="${h}" fill="#bfe6ff"/>${['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'].map((color, i) => `<path d="M ${200 + pan} ${h * 0.7} A ${440 - i * 24} ${440 - i * 24} 0 0 1 ${1080 + pan - i * 48} ${h * 0.7}" stroke="${color}" stroke-width="24" fill="none" transform="translate(${i * 24} 0)"/>`).join('')}<rect y="${h * 0.7}" width="${w}" height="${h * 0.3}" fill="#2a5f8f"/>`,
  },
];

function movieSvg(width, height, shot, pan) {
  const playerHeight = height - 120;
  return svgDoc(
    width,
    height,
    `<svg x="0" y="0" width="${width}" height="${playerHeight}" viewBox="0 0 ${width} ${playerHeight}">${SHOTS[shot].scene(width, playerHeight, pan)}</svg><rect x="${width / 2 - 520}" y="${playerHeight - 90}" width="1040" height="56" rx="8" fill="#000000" fill-opacity="0.6"/><text x="${width / 2}" y="${playerHeight - 52}" text-anchor="middle" font-family="${FONT}" font-size="28" fill="#ffffff">${escape(SHOTS[shot].caption)}</text><rect y="${playerHeight}" width="${width}" height="120" fill="#111"/><rect x="40" y="${playerHeight + 50}" width="${width - 80}" height="8" rx="4" fill="#444"/><rect x="40" y="${playerHeight + 50}" width="${((width - 80) * (shot + 1)) / SHOTS.length}" height="8" rx="4" fill="#e50914"/>`,
    '#000',
  );
}

const SKIN = '#e0ac69';

function hand(fingers, x, y) {
  const palm = `<rect x="${x}" y="${y}" width="200" height="220" rx="50" fill="${SKIN}"/>`;
  const finger = (index) =>
    `<rect x="${x + 8 + index * 48}" y="${y - 150}" width="38" height="190" rx="19" fill="${SKIN}"/>`;
  const thumb = `<rect x="${x - 70}" y="${y + 40}" width="110" height="40" rx="20" fill="${SKIN}" transform="rotate(-30 ${x} ${y + 60})"/>`;
  if (fingers === 2)
    return `${palm}<rect x="${x + 30}" y="${y - 160}" width="38" height="200" rx="19" fill="${SKIN}" transform="rotate(-12 ${x + 49} ${y})"/><rect x="${x + 110}" y="${y - 160}" width="38" height="200" rx="19" fill="${SKIN}" transform="rotate(12 ${x + 129} ${y})"/>`;
  return `${palm}${[0, 1, 2, 3].map(finger).join('')}${thumb}`;
}

const PROPS = {
  apple: (x, y) =>
    `<circle cx="${x + 100}" cy="${y + 110}" r="100" fill="#c62828"/><rect x="${x + 94}" y="${y - 10}" width="12" height="40" fill="#5d4037"/><ellipse cx="${x + 135}" cy="${y + 5}" rx="34" ry="14" fill="#2e7d32"/>`,
  book: (x, y) =>
    `<rect x="${x - 20}" y="${y - 60}" width="250" height="330" rx="8" fill="#1a3d6d"/><text x="${x + 105}" y="${y + 60}" text-anchor="middle" font-family="${FONT}" font-size="40" font-weight="bold" fill="#f5e6c8">MOBY</text><text x="${x + 105}" y="${y + 110}" text-anchor="middle" font-family="${FONT}" font-size="40" font-weight="bold" fill="#f5e6c8">DICK</text>`,
  card: (x, y, text) =>
    `<rect x="${x - 60}" y="${y - 20}" width="300" height="200" rx="10" fill="#fff59d" stroke="#9e9d24" stroke-width="4"/><text x="${x + 90}" y="${y + 100}" text-anchor="middle" font-family="${FONT}" font-size="44" font-weight="bold" fill="#212121">${escape(text)}</text>`,
  peace: (x, y) => hand(2, x, y + 60),
  palm: (x, y) => hand(5, x, y + 60),
};

function cameraSvg(width, height, { prop, lift = 0, card, away = false }) {
  const board = `<rect x="740" y="90" width="460" height="300" fill="#fafafa" stroke="#888" stroke-width="6"/><text x="970" y="260" text-anchor="middle" font-family="${FONT}" font-size="40" fill="#1565c0">Sprint 14</text>`;
  const person = away
    ? ''
    : `<ellipse cx="420" cy="720" rx="260" ry="240" fill="#3f51b5"/><circle cx="420" cy="330" r="130" fill="${SKIN}"/><rect x="290" y="190" width="260" height="70" rx="35" fill="#3e2723"/>`;
  const held =
    prop === undefined
      ? ''
      : `<g transform="translate(${width / 2 - 300} ${120 + lift}) scale(2.2)">${PROPS[prop](0, 60, card)}</g>`;
  return svgDoc(
    width,
    height,
    `<rect width="${width}" height="${height * 0.75}" fill="#d7ccc8"/><rect y="${height * 0.75}" width="${width}" height="${height * 0.25}" fill="#8d6e63"/>${board}${person}${held}`,
  );
}

function seconds(value) {
  return Math.round((value * 1000) / SAMPLE_MS);
}

function holdThenMove(segments, moveSamples) {
  const samples = [];
  for (const [index, segment] of segments.entries()) {
    if (index > 0)
      for (let step = 1; step <= moveSamples; step += 1)
        samples.push({ segment: null, moving: true, from: index - 1, to: index, step });
    for (let step = 0; step < segment.samples; step += 1)
      samples.push({ segment: segment.id, moving: false, index, step });
  }
  return samples;
}

export const CASES = [
  {
    id: 'reading',
    title: 'Reading a document (cursor blink ignored; page turn and one typed line caught)',
    source: 'screen',
    size: [1440, 900],
    samples: () =>
      Array.from({ length: seconds(45) }, (_, step) => {
        const page = step < seconds(20) ? 0 : 1;
        const typed = step >= seconds(32);
        return {
          segment: page === 0 ? 'page-1' : typed ? 'page-2-typed' : 'page-2',
          moving: false,
          page,
          typed,
          step,
        };
      }),
    key: (sample) => `page-${sample.page}-${sample.typed}-cursor-${sample.step % 2}`,
    svg: (sample, [w, h]) => readingSvg(w, h, sample.step % 2 === 0, sample.page, sample.typed),
    expect: { perSegment: [1, 1], noMoving: true },
    question: '我在读的这份文档叫什么？这一页有哪三个小标题？我刚在末尾加的那句话说了什么？',
    answer: {
      groups: [
        ['Harbor Lights'],
        ['Results'],
        ['Discussion'],
        ['Next steps'],
        ['12 May', '5月12', '5 月 12'],
      ],
    },
  },
  {
    id: 'scroll',
    title: 'Scrolling code (one per screen, none blurred)',
    source: 'screen',
    size: [1440, 900],
    screens: 6,
    samples() {
      return holdThenMove(
        Array.from({ length: this.screens }, (_, index) => ({
          id: `screen-${index + 1}`,
          samples: seconds(4),
        })),
        2,
      );
    },
    offset(sample) {
      const page = 40 * CODE_LINE_HEIGHT;
      if (!sample.moving) return sample.index * page;
      const eased = [0.35, 0.8][sample.step - 1];
      return Math.round((sample.from + eased) * page);
    },
    expect: { perSegment: [1, 1], noMoving: true },
    question: `代码第 ${SECRET_LINE} 行把哪个变量设成了什么值？看不清的话放大那一格。`,
    answer: { groups: [['VIOLET-42', 'VIOLET 42', 'VIOLET42']], also: [['portalSecret']] },
  },
  {
    id: 'windows',
    title: 'Switching windows (one per switch)',
    source: 'screen',
    size: [1440, 900],
    samples: () =>
      WINDOWS.flatMap((_, index) =>
        Array.from({ length: seconds(5) }, (_, step) => ({
          segment: `window-${index + 1}`,
          moving: false,
          index,
          step,
        })),
      ),
    key: (sample) => `window-${sample.index}`,
    svg: (sample, [w, h]) =>
      windowChrome(
        w,
        h,
        WINDOWS[sample.index].title,
        WINDOWS[sample.index].body(w, h),
        WINDOWS[sample.index].accent,
      ),
    expect: { perSegment: [1, 1], noMoving: true },
    question: '我刚才依次切到了哪几个窗口？按顺序说。',
    answer: {
      ordered: true,
      groups: [
        ['main.rs', 'editor', '编辑器', 'Rust'],
        ['Oslo', '奥斯陆', 'weather', '天气'],
        ['cargo', 'terminal', '终端'],
        ['Team Chat', 'chat', '聊天'],
        ['Budget', 'spreadsheet', '预算', '表格'],
      ],
    },
  },
  {
    id: 'movie',
    title: 'Film clip (one per shot, plot in order)',
    source: 'screen',
    size: [1440, 900],
    samples: () =>
      SHOTS.flatMap((_, index) =>
        Array.from({ length: seconds(6) }, (_, step) => ({
          segment: `shot-${index + 1}`,
          moving: false,
          index,
          step,
        })),
      ),
    key: (sample) => `shot-${sample.index}-${sample.step}`,
    svg: (sample, [w, h]) => movieSvg(w, h, sample.index, sample.step * 3),
    expect: { perSegment: [1, 1], noMoving: true },
    question: '按顺序讲讲刚才这段片子的情节。',
    answer: {
      ordered: true,
      groups: [
        ['fisherman', 'boat', '渔夫', '小船', '船'],
        ['red car', 'car', '红色', '汽车', '车'],
        ['dog', '狗'],
        ['storm', 'lightning', '暴风', '雷', '闪电'],
        ['rainbow', '彩虹'],
      ],
    },
  },
  {
    id: 'camera',
    title: 'Camera: holding objects and hand signs',
    source: 'camera',
    size: [1280, 720],
    noise: 10,
    jitter: 2,
    samples: () =>
      holdThenMove(
        [undefined, 'apple', 'book', 'peace', 'palm'].map((prop, index) => ({
          id: prop ?? 'empty',
          samples: seconds(index === 0 ? 3 : 4),
          prop,
        })),
        2,
      ),
    prop(sample) {
      const props = [undefined, 'apple', 'book', 'peace', 'palm'];
      if (!sample.moving) return { prop: props[sample.index], lift: 0 };
      return sample.step === 1
        ? { prop: props[sample.from], lift: 380 }
        : { prop: props[sample.to], lift: 300 };
    },
    expect: { perSegment: [1, 2], maxTotalPerSegment: 1.6 },
    question: '我刚才在镜头前依次拿起了什么、比了什么手势？按顺序说。',
    answer: {
      ordered: true,
      groups: [
        ['apple', '苹果'],
        ['Moby', '白鲸', 'book', '书'],
        ['V', '剪刀', '两根', '二', 'peace', 'victory', '胜利', '耶'],
        ['palm', '手掌', '五', '张开', '5', 'open hand', 'high five', '击掌'],
      ],
    },
  },
  {
    id: 'silence',
    title: 'Five silent minutes, then a question',
    source: 'camera',
    size: [1280, 720],
    noise: 8,
    jitter: 1,
    timeline: [
      [0, 'idle-1'],
      [40, 'card-milk'],
      [50, 'idle-2'],
      [90, 'away'],
      [120, 'idle-3'],
      [200, 'card-mom'],
      [210, 'idle-4'],
    ],
    samples() {
      return Array.from({ length: seconds(300) }, (_, step) => {
        const at = (step * SAMPLE_MS) / 1000;
        const segment = this.timeline.filter(([from]) => from <= at).at(-1)[1];
        return { segment, moving: false, step };
      });
    },
    prop(sample) {
      const cards = { 'card-milk': 'BUY MILK', 'card-mom': 'CALL MOM' };
      return {
        prop: cards[sample.segment] === undefined ? undefined : 'card',
        card: cards[sample.segment],
        lift: 0,
        away: sample.segment === 'away',
      };
    },
    expect: { perSegment: [1, 2] },
    question: '这五分钟里我举起来给你看过哪些字条？按顺序说。中间我离开过吗？',
    answer: {
      ordered: true,
      groups: [
        ['MILK', '牛奶'],
        ['MOM', '妈'],
      ],
    },
  },
];

async function loadSharp() {
  const entry = require.resolve('sharp', { paths: [join(root, 'packages/core')] });
  return (await import(pathToFileURL(entry).href)).default;
}

async function loadKeyframes() {
  const { unrun } = await import(pathToFileURL(require.resolve('unrun', { paths: [root] })).href);
  return (await unrun({ path: join(root, 'packages/core/src/voice/keyframes.ts') })).module;
}

function addNoise(raw, rng, amplitude, jitter, width, height) {
  const out = Buffer.alloc(raw.length);
  const dx = Math.round((rng() * 2 - 1) * jitter);
  const dy = Math.round((rng() * 2 - 1) * jitter);
  const gain = 1 + (rng() * 2 - 1) * 0.01;
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(height - 1, Math.max(0, y + dy));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(width - 1, Math.max(0, x + dx));
      const from = (sy * width + sx) * 3;
      const to = (y * width + x) * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        const value = raw[from + channel] * gain + (rng() + rng() - 1) * amplitude;
        out[to + channel] = value < 0 ? 0 : value > 255 ? 255 : value;
      }
    }
  }
  return out;
}

export async function generateFixture(spec, folder, sharp) {
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  const [width, height] = spec.size;
  const samples = spec.samples();
  const rng = mulberry32(0x5eed + spec.id.length);
  const cache = new Map();
  const rawOf = async (svg) =>
    sharp(Buffer.from(svg)).resize(width, height).removeAlpha().raw().toBuffer();
  let canvas;
  if (spec.id === 'scroll') {
    const { svg, height: canvasHeight } = codeCanvasSvg(width);
    canvas = {
      raw: await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer(),
      height: canvasHeight,
    };
  }
  for (const [index, sample] of samples.entries()) {
    let raw;
    if (canvas !== undefined) {
      const offset = spec.offset(sample);
      const stride = width * 3;
      const crop = (top) => canvas.raw.subarray(top * stride, (top + height) * stride);
      if (!sample.moving) raw = Buffer.from(crop(offset));
      else {
        const sum = new Float64Array(stride * height);
        const taps = 9;
        for (let tap = 0; tap < taps; tap += 1) {
          const part = crop(Math.max(0, offset - 60 + tap * 15));
          for (let i = 0; i < part.length; i += 1) sum[i] += part[i];
        }
        raw = Buffer.from(Uint8Array.from(sum, (value) => value / taps));
      }
    } else if (spec.source === 'camera') {
      const state = spec.prop(sample);
      const key = JSON.stringify(state);
      if (!cache.has(key)) cache.set(key, await rawOf(cameraSvg(width, height, state)));
      raw = addNoise(cache.get(key), rng, spec.noise, spec.jitter, width, height);
    } else {
      const key = spec.key(sample);
      if (!cache.has(key)) cache.set(key, await rawOf(spec.svg(sample, spec.size)));
      raw = cache.get(key);
    }
    await sharp(raw, { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 80 })
      .toFile(join(folder, `${String(index + 1).padStart(5, '0')}.jpg`));
  }
  return samples;
}

export function judgePicks(spec, samples, picks) {
  const counts = new Map();
  for (const sample of samples) if (sample.segment !== null) counts.set(sample.segment, 0);
  let moving = 0;
  let transitions = 0;
  for (const index of picks) {
    const sample = samples[index];
    if (sample === undefined) continue;
    if (sample.moving) moving += 1;
    if (sample.segment === null) transitions += 1;
    else counts.set(sample.segment, (counts.get(sample.segment) ?? 0) + 1);
  }
  const reasons = [];
  const expect = spec.expect;
  if (
    expect.total !== undefined &&
    (picks.length < expect.total[0] || picks.length > expect.total[1])
  )
    reasons.push(`${picks.length} keyframes, expected ${expect.total[0]}–${expect.total[1]}`);
  if (expect.perSegment !== undefined)
    for (const [segment, count] of counts)
      if (count < expect.perSegment[0] || count > expect.perSegment[1])
        reasons.push(`${segment}: ${count} keyframes, expected ${expect.perSegment.join('–')}`);
  if (expect.noMoving === true && moving > 0) reasons.push(`${moving} keyframes caught mid-motion`);
  if (
    expect.maxTotalPerSegment !== undefined &&
    picks.length > Math.ceil(counts.size * expect.maxTotalPerSegment)
  )
    reasons.push(
      `${picks.length} keyframes for ${counts.size} segments, at most ${Math.ceil(counts.size * expect.maxTotalPerSegment)}`,
    );
  return {
    keyframes: picks.length,
    perSegment: Object.fromEntries(counts),
    transitions,
    moving,
    pass: reasons.length === 0,
    reasons,
  };
}

export function judgeAnswer(answer, text) {
  const lower = text.toLowerCase();
  const find = (group) =>
    Math.min(
      ...group.map((word) => {
        const at = lower.indexOf(word.toLowerCase());
        return at < 0 ? Number.POSITIVE_INFINITY : at;
      }),
    );
  const positions = answer.groups.map(find);
  const missing = answer.groups.filter((_, index) => !Number.isFinite(positions[index]));
  const reasons = missing.map((group) => `missing ${group[0]}`);
  if (answer.ordered === true && missing.length === 0)
    for (let index = 1; index < positions.length; index += 1)
      if (positions[index] < positions[index - 1])
        reasons.push(`${answer.groups[index][0]} came before ${answer.groups[index - 1][0]}`);
  return { pass: reasons.length === 0, reasons };
}

export async function pickFolder(folder, count, options, sharp, keyframes) {
  const picker = keyframes.createKeyframePicker(options);
  const picks = [];
  let bytes = 0;
  let pickMs = 0;
  for (let index = 0; index < count; index += 1) {
    const file = join(folder, `${String(index + 1).padStart(5, '0')}.jpg`);
    const data = readFileSync(file);
    const started = performance.now();
    const thumb = await sharp(data)
      .resize({ width: options.thumbWidth })
      .greyscale()
      .raw()
      .toBuffer();
    const decision = picker.push(new Uint8Array(thumb), index * SAMPLE_MS);
    pickMs += performance.now() - started;
    if (decision.keyframe) {
      picks.push(index);
      bytes += data.byteLength;
    }
  }
  return { picks, bytes, pickMs: Math.round(pickMs) };
}

export function sweepConfigs(defaults) {
  const configs = [];
  const add = (source, name, options) =>
    configs.push({ source, name, options: { ...defaults[source], detail: undefined, ...options } });
  for (const threshold of [0.002, 0.004, 0.008, 0.016])
    add('screen', 'pixel', { metric: 'pixel', threshold, stillness: 0.001 });
  for (const threshold of [0.06, 0.1, 0.16])
    add('screen', 'phash', { metric: 'phash', threshold, stillness: 0.04 });
  for (const threshold of [0.1, 0.16])
    for (const detail of [0.01, 0.015, 0.02, 0.03])
      add('screen', 'phash+detail', {
        metric: 'phash',
        threshold,
        stillness: 0.04,
        detail: { threshold: detail, stillness: 0.004 },
      });
  for (const threshold of [0.02, 0.03, 0.04, 0.08])
    add('camera', 'pixel', { metric: 'pixel', threshold, stillness: 0.04 });
  for (const threshold of [0.06, 0.1, 0.12, 0.16, 0.24])
    add('camera', 'phash', { metric: 'phash', threshold, stillness: 0.04 });
  return configs;
}

function cli(env) {
  const run = promisify(execFile);
  const entry = join(root, 'packages/deepseekbot/dist/deepseekbot.mjs');
  if (!existsSync(entry)) throw new Error('Build the CLI first: pnpm build.');
  return async (args, timeout = 120_000) => {
    const { stdout } = await run(process.execPath, [entry, ...args, '--compact'], {
      env,
      windowsHide: true,
      timeout,
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  };
}

function hostEnv(name) {
  if (process.env.DEEPSEEKBOT_HOST && process.env.DEEPSEEKBOT_HOST_TOKEN) return { ...process.env };
  const path = join(root, '.humanlayer/verify', name, 'instance.json');
  if (!existsSync(path))
    throw new Error(
      `No Host: launch one with node scripts/verify-app.mjs launch --name ${name} --build, or set DEEPSEEKBOT_HOST and DEEPSEEKBOT_HOST_TOKEN.`,
    );
  const login = new URL(JSON.parse(readFileSync(path, 'utf8')).url);
  return {
    ...process.env,
    DEEPSEEKBOT_HOST: login.origin,
    DEEPSEEKBOT_HOST_TOKEN: login.searchParams.get('token') ?? '',
  };
}

async function fetchAttachment(host, channelId, messageId, fileId) {
  if (!host.cookie) {
    const login = new URL(host.origin);
    login.searchParams.set('token', host.token);
    const response = await fetch(login, { redirect: 'manual' });
    await response.body?.cancel();
    host.cookie = response.headers
      .getSetCookie()
      .map((entry) => entry.split(';')[0])
      .join('; ');
  }
  const url = new URL('/api/botharness/attachment', host.origin);
  url.search = new URLSearchParams({ fileId, channelId, messageId }).toString();
  const response = await fetch(url, { headers: { cookie: host.cookie } });
  if (!response.ok) {
    await response.body?.cancel();
    return undefined;
  }
  return Buffer.from(await response.arrayBuffer());
}

function wav(ms) {
  const count = Math.round(16 * ms);
  const out = Buffer.alloc(44 + count * 2);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + count * 2, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(16_000, 24);
  out.writeUInt32LE(32_000, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(count * 2, 40);
  return out;
}

async function stubVoice() {
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      if (request.url?.endsWith('/audio/speech')) {
        let text = '';
        try {
          text = JSON.parse(body).input ?? '';
        } catch {}
        const audio = wav(Math.min(4_000, 200 + text.length * 60));
        response.writeHead(200, { 'content-type': 'audio/wav', 'content-length': audio.length });
        return response.end(audio);
      }
      if (request.url?.endsWith('/audio/transcriptions')) {
        response.writeHead(200, { 'content-type': 'application/json' });
        return response.end('{"text":""}');
      }
      response.writeHead(404);
      response.end();
    });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}/v1` };
}

async function bindStub(run, bot, baseUrl) {
  const tts = await run([
    'voice-provider-add',
    'custom',
    '--name',
    'VC8 stub TTS',
    '--base-url',
    baseUrl,
    '--model',
    'stub',
    '--voice',
    'stub',
  ]);
  const asr = await run([
    'voice-provider-add',
    'custom',
    '--kind',
    'asr',
    '--name',
    'VC8 stub ASR',
    '--base-url',
    baseUrl,
    '--model',
    'stub',
  ]);
  await run(['voice-set', bot, tts.provider.id]);
  await run(['voice-asr-set', bot, asr.provider.id]);
  return [tts.provider.id, asr.provider.id];
}

async function liveCase(spec, samples, folder, out, run, host, bot, replyWait) {
  const durationMs = samples.length * SAMPLE_MS;
  const script = join(out, `${spec.id}-script.json`);
  writeFileSync(script, JSON.stringify([{ at: durationMs + 1_000, text: spec.question }]));
  const report = await run(
    [
      'call-simulate',
      bot,
      '--script',
      script,
      spec.source === 'camera' ? '--video' : '--screen',
      folder,
      '--reply-wait',
      String(replyWait),
    ],
    durationMs + replyWait * 1000 + 120_000,
  );
  writeFileSync(join(out, `${spec.id}-call.json`), JSON.stringify(report, null, 2));
  const events = report.events ?? [];
  const visual = report.visual ?? {};
  const question = report.texts?.[0];
  const textEvent = events.find((event) => event.type === 'text');
  const gridSent = events.find(
    (event) => event.type === 'grid-sent' && event.messageId === question?.messageId,
  );
  const shownAt = gridSent?.at ?? textEvent?.at;
  const firstAudio = events.find(
    (event) => event.type === 'playing' && shownAt !== undefined && event.at >= shownAt,
  );
  const page = await run(['channel-messages', `dm-${bot}`, '--limit', '60']);
  const messages = page.messages ?? [];
  const asked = messages.find((message) => message.id === question?.messageId);
  const answerText = messages
    .filter(
      (message) =>
        message.author?.kind === 'bot' &&
        asked !== undefined &&
        Date.parse(message.at) >= Date.parse(asked.at),
    )
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map((message) => message.body ?? '')
    .join('\n');
  const gridFiles = [];
  const pictured = messages
    .filter(
      (message) =>
        message.id === question?.messageId ||
        (message.voiceCallRecord?.state === 'frames' &&
          message.voiceCallRecord?.callId === report.callId),
    )
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const message of pictured)
    for (const attachment of message.attachments ?? []) {
      if (attachment.fileId === undefined) continue;
      const file = join(out, 'grids', `${spec.id}-${gridFiles.length + 1}.jpg`);
      mkdirSync(dirname(file), { recursive: true });
      const bytes = await fetchAttachment(host, `dm-${bot}`, message.id, attachment.fileId);
      if (bytes === undefined) continue;
      writeFileSync(file, bytes);
      gridFiles.push(file);
    }
  const answer = judgeAnswer(spec.answer, answerText);
  const reasons = [...answer.reasons];
  if (!report.answered) reasons.push('no spoken answer');
  if ((visual.harvest?.dropped ?? 0) > 0)
    reasons.push(`${visual.harvest.dropped} keyframes dropped`);
  if ((visual.failed ?? []).length > 0) reasons.push(`grid failed: ${visual.failed.join('; ')}`);
  const composeMs = [...(visual.grids ?? []), ...(visual.records ?? [])].map(
    (grid) => grid.composeMs,
  );
  return {
    callId: report.callId,
    keyframes: visual.keyframes,
    sentFrames: visual.sentFrames,
    uplinkBytes: visual.frameBytes,
    grids: (visual.grids ?? []).map((grid) => ({
      frames: grid.frames,
      layout: grid.layout,
      bytes: grid.bytes,
      composeMs: grid.composeMs,
    })),
    records: (visual.records ?? []).length,
    composeMs: { max: Math.max(0, ...composeMs), total: composeMs.reduce((a, b) => a + b, 0) },
    seeToSpeakMs:
      firstAudio === undefined || shownAt === undefined ? null : firstAudio.at - shownAt,
    firstTextMs: report.firstTextMs,
    zooms: events.filter((event) => event.type === 'frame-zoomed').length,
    answer: answerText,
    gridFiles: gridFiles.map((file) => file.slice(out.length + 1)),
    pass: reasons.length === 0,
    reasons,
  };
}

function markdown(report) {
  const lines = [`# VC8 keyframe evaluation`, '', `- Started: ${report.startedAt}`];
  if (report.model) lines.push(`- Model: ${report.model}`);
  lines.push(
    '',
    '## Picker (shipped defaults)',
    '',
    '| Case | Source | Samples | Keyframes | Uplink KB | Pick ms | Result |',
    '|---|---|---|---|---|---|---|',
  );
  for (const entry of report.cases)
    lines.push(
      `| ${entry.id} | ${entry.source} | ${entry.samples} | ${entry.picker.keyframes} | ${(entry.picker.bytes / 1024).toFixed(0)} | ${entry.picker.pickMs} | ${entry.picker.pass ? 'pass' : `FAIL: ${entry.picker.reasons.join('; ')}`} |`,
    );
  if (report.cases.some((entry) => entry.live !== undefined)) {
    lines.push(
      '',
      '## Live calls',
      '',
      '| Case | Keyframes | Uplink KB | Grids (layout) | Records | Compose max ms | See-to-speak ms | Zooms | Result |',
      '|---|---|---|---|---|---|---|---|---|',
    );
    for (const entry of report.cases) {
      const live = entry.live;
      if (live === undefined) continue;
      if (live.error !== undefined) {
        lines.push(`| ${entry.id} | | | | | | | | ERROR: ${live.error} |`);
        continue;
      }
      lines.push(
        `| ${entry.id} | ${live.keyframes} | ${((live.uplinkBytes ?? 0) / 1024).toFixed(0)} | ${live.grids.map((grid) => grid.layout).join(', ')} | ${live.records} | ${live.composeMs.max} | ${live.seeToSpeakMs ?? '—'} | ${live.zooms} | ${live.pass ? 'pass' : `FAIL: ${live.reasons.join('; ')}`} |`,
      );
    }
    lines.push('', '### Answers', '');
    for (const entry of report.cases)
      if (entry.live?.answer !== undefined)
        lines.push(`- **${entry.id}**: ${entry.live.answer.replaceAll('\n', ' ')}`);
  }
  if (report.compare !== undefined) {
    lines.push(
      '',
      '## Pixel difference vs perceptual hash',
      '',
      '| Source | Metric | Threshold | Stillness | Detail | Cases passed | Keyframes | Pick ms |',
      '|---|---|---|---|---|---|---|---|',
    );
    for (const row of report.compare)
      lines.push(
        `| ${row.source} | ${row.metric} | ${row.threshold} | ${row.stillness} | ${row.detail ?? '—'} | ${row.passed}/${row.cases}${row.failed.length ? ` (${row.failed.join(', ')})` : ''} | ${row.keyframes} | ${row.pickMs} |`,
      );
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const { values } = parseArgs({
    options: {
      case: { type: 'string', multiple: true },
      compare: { type: 'boolean' },
      bot: { type: 'string' },
      name: { type: 'string', default: 'vc8' },
      'stub-voice': { type: 'boolean' },
      'reply-wait': { type: 'string', default: '150' },
      out: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(usage);
    return 0;
  }
  const selected = values.case ?? CASES.map((spec) => spec.id);
  const unknown = selected.filter((id) => !CASES.some((spec) => spec.id === id));
  if (unknown.length > 0) throw new Error(`Unknown case: ${unknown.join(', ')}`);
  const replyWait = Number(values['reply-wait']);
  if (!Number.isFinite(replyWait) || replyWait < 10 || replyWait > 240)
    throw new Error('--reply-wait must be 10–240 seconds.');
  const out = resolve(
    values.out ??
      join(root, '.humanlayer/call-keyframe-eval', new Date().toISOString().replaceAll(':', '-')),
  );
  mkdirSync(out, { recursive: true });
  const sharp = await loadSharp();
  const keyframes = await loadKeyframes();
  const report = {
    startedAt: new Date().toISOString(),
    defaults: keyframes.KEYFRAME_DEFAULTS,
    cases: [],
  };
  const fixtures = new Map();
  for (const id of selected) {
    const spec = CASES.find((entry) => entry.id === id);
    const folder = join(out, 'fixtures', spec.id);
    const started = performance.now();
    const samples = await generateFixture(spec, folder, sharp);
    fixtures.set(spec.id, { spec, samples, folder });
    const options = keyframes.KEYFRAME_DEFAULTS[spec.source];
    const picked = await pickFolder(folder, samples.length, options, sharp, keyframes);
    report.cases.push({
      id: spec.id,
      title: spec.title,
      source: spec.source,
      samples: samples.length,
      generateMs: Math.round(performance.now() - started),
      picker: {
        ...judgePicks(spec, samples, picked.picks),
        picks: picked.picks,
        bytes: picked.bytes,
        pickMs: picked.pickMs,
      },
    });
    console.error(
      `${spec.id}: ${picked.picks.length} keyframes ${report.cases.at(-1).picker.pass ? 'pass' : 'FAIL'}`,
    );
  }
  if (values.compare) {
    report.compare = [];
    for (const config of sweepConfigs(keyframes.KEYFRAME_DEFAULTS)) {
      const entries = [...fixtures.values()].filter((entry) => entry.spec.source === config.source);
      if (entries.length === 0) continue;
      const row = {
        source: config.source,
        metric: config.name,
        threshold: config.options.threshold,
        stillness: config.options.stillness,
        detail: config.options.detail?.threshold ?? null,
        cases: entries.length,
        passed: 0,
        failed: [],
        keyframes: 0,
        pickMs: 0,
      };
      for (const { spec, samples, folder } of entries) {
        const picked = await pickFolder(folder, samples.length, config.options, sharp, keyframes);
        const judged = judgePicks(spec, samples, picked.picks);
        row.keyframes += picked.picks.length;
        row.pickMs += picked.pickMs;
        if (judged.pass) row.passed += 1;
        else row.failed.push(`${spec.id}: ${judged.reasons[0]}`);
      }
      report.compare.push(row);
    }
  }
  if (values.bot !== undefined) {
    const env = hostEnv(values.name);
    const run = cli(env);
    const host = { origin: env.DEEPSEEKBOT_HOST, token: env.DEEPSEEKBOT_HOST_TOKEN, cookie: '' };
    let stub;
    if (values['stub-voice']) {
      stub = await stubVoice();
      await bindStub(run, values.bot, stub.baseUrl);
    }
    try {
      for (const entry of report.cases) {
        const { spec, samples, folder } = fixtures.get(entry.id);
        console.error(
          `${spec.id}: live call (${(samples.length * SAMPLE_MS) / 1000} s of ${spec.source})…`,
        );
        try {
          entry.live = await liveCase(spec, samples, folder, out, run, host, values.bot, replyWait);
        } catch (error) {
          entry.live = {
            pass: false,
            error: error instanceof Error ? error.message.slice(0, 300) : 'failed',
            reasons: ['error'],
          };
        }
        console.error(
          `${spec.id}: ${entry.live.pass ? 'pass' : `FAIL ${entry.live.reasons.join('; ')}`}`,
        );
      }
    } finally {
      stub?.server.close();
    }
  }
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(out, 'report.md'), markdown(report));
  process.stdout.write(markdown(report));
  console.error(`Report: ${join(out, 'report.md')}`);
  const failed = report.cases.some((entry) => !entry.picker.pass || entry.live?.pass === false);
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(2);
    },
  );
