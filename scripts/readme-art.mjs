import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const font = JSON.parse(
  readFileSync(new URL('../docs/assets/readme/pixel/source/glyphs.json', import.meta.url), 'utf8'),
);
const avatars = JSON.parse(
  readFileSync(new URL('../docs/assets/readme/pixel/source/avatars.json', import.meta.url), 'utf8'),
);
const escape = (s) =>
  String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const palettes = {
  day: {
    ink: '#3b2414',
    wood: '#b8702f',
    paper: '#fff3d1',
    soft: '#6b4a2e',
    hi: '#fffbea',
    shade: '#ead39b',
    accent: '#3d5afe',
    sky: '#8bcaff',
    bottom: '#e0f3ff',
    grass: '#71964a',
    white: '#ffffff',
  },
  night: {
    ink: '#05070f',
    wood: '#6b4325',
    paper: '#1f2747',
    soft: '#c2b59b',
    hi: '#f3e6c8',
    shade: '#111931',
    accent: '#8c9eff',
    sky: '#101831',
    bottom: '#293f71',
    grass: '#365a49',
    white: '#f3e6c8',
  },
};
const rect = (x, y, w, h, fill, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
function text(s, x, y, size, color, anchor = 'start', extra = '') {
  const run = [...String(s)].map((c) => {
    const g = font.glyphs[c];
    if (!g) throw new Error('Missing README glyph: ' + c);
    return g;
  });
  const scale = size / font.unitsPerEm;
  const width = run.reduce((n, g) => n + g.advance, 0) * scale;
  let cursor = x - (anchor === 'middle' ? width / 2 : anchor === 'end' ? width : 0);
  return (
    '<g fill="' +
    color +
    '" ' +
    extra +
    '>' +
    run
      .map((g) => {
        const path =
          '<path d="' +
          g.path +
          '" transform="translate(' +
          cursor +
          ' ' +
          y +
          ') scale(' +
          scale +
          ' ' +
          -scale +
          ')"/>';
        cursor += g.advance * scale;
        return path;
      })
      .join('') +
    '</g>'
  );
}
function svg(w, h, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escape(title)}"><title>${escape(title)}</title>${body}</svg>`;
}
function frame(w, h, p) {
  return (
    rect(4, 4, w - 4, h - 4, p.ink) +
    rect(0, 0, w - 4, h - 4, p.ink) +
    rect(3, 3, w - 10, h - 10, p.wood) +
    rect(8, 8, w - 20, h - 20, p.paper) +
    rect(8, 8, w - 20, 2, p.hi) +
    rect(8, h - 14, w - 20, 2, p.shade)
  );
}
function avatar(index, x, y, size) {
  return avatars[index]
    .replace('<svg ', `<svg x="${x}" y="${y}" `)
    .replace(/width="512" height="512"/, `width="${size}" height="${size}"`);
}

export function renderStatus(stats, lang, theme) {
  const p = palettes[theme];
  const zh = lang === 'zh';
  let body =
    frame(960, 414, p) +
    text('REPOSITORY / DeepSeekBot', 27, 37, 20, theme === 'day' ? p.ink : p.hi) +
    text(stats.updatedAt.slice(0, 16).replace('T', ' ') + ' UTC', 927, 35, 15, p.soft, 'end');
  const metrics = [
    ['STARS', stats.stars, zh ? '收藏这个小镇' : 'Stargazers'],
    ['FORKS', stats.forks, zh ? '一起探索' : 'Forks'],
    ['OPEN ISSUES', stats.issues, zh ? '问题与想法' : 'Issues'],
    ['OPEN PRs', stats.pullRequests, zh ? '正在建设' : 'Pull requests'],
    [
      'CLOSED PRs / 30 DAYS',
      stats.activity.closedPullRequests,
      zh ? '近 30 天 · 含已合并 PR' : 'Last 30 days · includes merged PRs',
    ],
    [
      'COMMITS / 30 DAYS',
      stats.activity.commits,
      zh ? '近 30 天 · 默认分支' : 'Last 30 days · default branch',
    ],
  ];
  metrics.forEach(([label, value, sub], i) => {
    const x = 25 + (i % 3) * 306,
      y = 55 + Math.floor(i / 3) * 148;
    body +=
      rect(x + 3, y + 3, 294, 138, p.ink) +
      rect(x, y, 294, 138, theme === 'day' ? '#fffbea' : '#172039') +
      rect(x, y, 294, 3, i > 3 ? p.grass : p.accent) +
      text(label, x + 15, y + 27, 16, p.soft) +
      text(value.toLocaleString('en-US'), x + 15, y + 79, 43, theme === 'day' ? p.ink : p.hi) +
      text(sub, x + 15, y + 115, 15, p.soft);
  });
  body +=
    text(`RELEASE ${stats.release}`, 28, 379, 20, theme === 'day' ? p.ink : p.hi) +
    text('MIT LICENSE', 349, 379, 20, theme === 'day' ? p.ink : p.hi) +
    text(
      zh ? '最后成功更新 · 每六小时更新' : 'Last success / every 6 hours',
      926,
      379,
      15,
      p.soft,
      'end',
    );
  return svg(
    960,
    414,
    `DeepSeekBot: ${stats.stars} stars, ${stats.forks} forks, ${stats.issues} open issues, ${stats.pullRequests} open PRs; last 30 days: ${stats.activity.closedPullRequests} closed PRs, ${stats.activity.commits} commits. Updated ${stats.updatedAt}`,
    body,
  );
}

export function renderArtwork(assets) {
  mkdirSync(assets, { recursive: true });
  const names = {
    install: ['开始组建你的小团队', 'BUILD YOUR CREW'],
    features: ['一起做事，各有所长', 'MADE TO WORK TOGETHER'],
    community: ['来小镇坐坐', 'MEET THE COMMUNITY'],
    status: ['小镇建设中', 'BUILDING IN THE OPEN'],
  };
  for (const [theme, p] of Object.entries(palettes)) {
    for (const lang of ['zh', 'en']) {
      const zh = lang === 'zh';
      let clouds = '';
      for (const [x, y, w] of [
        [42, 63, 98],
        [769, 61, 130],
        [109, 177, 53],
        [829, 173, 56],
      ])
        clouds += `<g opacity="${theme === 'day' ? '.8' : '.15'}">${rect(x, y, w, 10, '#fff')}${rect(x + 12, y - 10, w - 30, 10, '#fff')}${rect(x + 25, y - 18, w - 57, 10, '#fff')}</g>`;
      let crew = '';
      for (const [i, index] of [2, 9, 7, 10, 4].entries()) {
        const x = 268 + i * 88,
          y = i % 2 ? 197 : 185;
        crew +=
          rect(x + 4, y + 4, 72, 72, p.ink) +
          rect(x, y, 72, 72, p.ink) +
          rect(x + 3, y + 3, 66, 66, p.paper) +
          avatar(index, x + 5, y + 5, 62);
      }
      const stars =
        theme === 'night'
          ? [
              [75, 40],
              [840, 33],
              [212, 120],
              [730, 139],
              [65, 221],
            ]
              .map(([x, y]) => rect(x, y, 3, 3, p.hi))
              .join('')
          : '';
      const title = text(
        'DeepSeekBot',
        480,
        107,
        79,
        p.white,
        'middle',
        `stroke="${p.ink}" stroke-width="6" paint-order="stroke" stroke-linejoin="miter"`,
      );
      const hero =
        frame(960, 310, p) +
        `<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${p.sky}"/><stop offset="1" stop-color="${p.bottom}"/></linearGradient></defs>` +
        rect(10, 10, 936, 282, 'url(#sky)') +
        clouds +
        stars +
        text(
          'A LITTLE TOWN. A CREW OF YOUR OWN.',
          480,
          39,
          15,
          theme === 'day' ? p.soft : p.hi,
          'middle',
        ) +
        `<g transform="translate(5 5)">${text('DeepSeekBot', 480, 107, 79, p.accent, 'middle', `stroke="${p.ink}" stroke-width="6" paint-order="stroke"`)}</g>` +
        title +
        text(
          zh
            ? '一组有各自身份、人格和记忆的 bots，一起做事。'
            : 'Bots with identity, personality and memory. Working together.',
          480,
          144,
          zh ? 23 : 20,
          theme === 'day' ? p.ink : p.hi,
          'middle',
        ) +
        rect(10, 277, 936, 15, p.grass) +
        rect(10, 277, 936, 4, theme === 'day' ? '#97b96c' : '#49765c') +
        crew +
        text('MIT / OPEN SOURCE', 29, 266, 13, theme === 'day' ? p.soft : p.hi) +
        text('deepseekbot.app', 928, 266, 14, theme === 'day' ? p.soft : p.hi, 'end');
      writeFileSync(
        join(assets, `hero-${lang}-${theme}.svg`),
        svg(960, 310, 'DeepSeekBot — a crew of your own', hero),
      );
      for (const [id, [cn, en]] of Object.entries(names)) {
        const label = zh ? cn : en;
        const titleWidth = zh ? 310 : 410;
        let body =
          frame(960, 58, p) +
          rect(12, 12, 46, 30, p.accent) +
          text(
            { install: '01', features: '02', community: '03', status: '04' }[id],
            35,
            34,
            18,
            theme === 'day' ? '#fff' : p.ink,
            'middle',
          ) +
          text(label, 77, 36, 24, theme === 'day' ? p.ink : p.hi);
        for (let x = titleWidth + 55; x < 883; x += 9)
          body += rect(x, 20, 3, 17, p.soft, 'opacity=".18"');
        body += rect(913, 22, 10, 10, p.grass) + rect(927, 22, 7, 10, p.accent);
        writeFileSync(join(assets, `${id}-${lang}-${theme}.svg`), svg(960, 58, label, body));
      }
      const star =
        frame(960, 100, p) +
        avatar(9, 15, 14, 68) +
        text(
          zh ? '给小镇点一颗 Star' : 'Leave a star for the little town',
          109,
          43,
          27,
          theme === 'day' ? p.ink : p.hi,
        ) +
        text(
          zh
            ? '收藏 DeepSeekBot，下次回来继续建设。'
            : 'Save DeepSeekBot. Come back and build with us.',
          110,
          72,
          18,
          p.soft,
        ) +
        text('STAR', 851, 59, 31, p.accent, 'middle');
      writeFileSync(
        join(assets, `star-${lang}-${theme}.svg`),
        svg(960, 100, zh ? '收藏 DeepSeekBot' : 'Star DeepSeekBot', star),
      );
    }
    for (const [id, label, accent] of [
      ['discord', 'DISCORD', '#5865f2'],
      ['qq', 'QQ GROUP', '#2379ac'],
      ['discuss', 'DISCUSSIONS', p.grass],
      ['contribute', 'CONTRIBUTE', p.wood],
      ['producthunt', 'PRODUCT HUNT', '#da552f'],
    ]) {
      writeFileSync(
        join(assets, `badge-${id}-${theme}.svg`),
        svg(
          190,
          38,
          label,
          frame(190, 38, p) +
            rect(13, 13, 9, 9, accent) +
            text(label, 31, 25, 16, theme === 'day' ? p.ink : p.hi),
        ),
      );
    }
  }
}
