import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { mulberry32 } from './seeded-random.mjs';

export const SAMPLE_MS = 500;

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
