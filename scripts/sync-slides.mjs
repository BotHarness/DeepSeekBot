#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://botharness.ai';
const HOME_TITLE = 'BotHarness Slides';
const HOME_DESCRIPTION =
  'BotHarness 介绍与分享 Slides：PersonaBot、记忆、执行与委派，一套幻灯片讲清楚。Intro decks for the BotHarness DSH plugin layer.';

const headTags = ({ title, description, canonical, noindex = false }) =>
  [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="BotHarness" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${SITE}/og.png" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${SITE}/og.png" />`,
    `<meta name="theme-color" content="#0a0f14" />`,
    ...(noindex ? [`<meta name="robots" content="noindex" />`] : []),
  ].join('\n    ');

const injectSeo = (html, head) => {
  let out = html.replace('<html lang="en">', '<html lang="zh-CN">');
  out = out.replace(/<link rel="icon" href="[^"]*" \/>/, '<link rel="icon" href="/favicon.ico" />');
  return out.replace(/<title>[^<]*<\/title>/, head);
};

const deckTitle = (id) => {
  const source = readFileSync(resolve(SLIDES_DIR, id, 'index.tsx'), 'utf8');
  return source.match(/title:\s*'([^']+)'/)?.[1] ?? id;
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SLIDES_DIR = resolve(ROOT, 'apps', 'presentations', 'slides');
const TARGET = resolve(ROOT, 'apps', 'docs', 'public', 'slides');

rmSync(TARGET, { recursive: true, force: true });
execFileSync(
  'pnpm',
  ['--filter', '@botharness/presentations', 'exec', 'open-slide', 'build', '--out-dir', TARGET],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, OPEN_SLIDE_BASE: '/slides/' },
    shell: false,
    windowsHide: true,
  },
);

const shell = resolve(TARGET, 'index.html');
const raw = readFileSync(shell, 'utf8');

writeFileSync(
  shell,
  injectSeo(
    raw,
    headTags({
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      canonical: `${SITE}/slides/`,
    }),
  ),
);
console.log('slides SEO → /slides/');

for (const id of readdirSync(SLIDES_DIR)) {
  if (id.startsWith('.')) continue;
  if (!statSync(resolve(SLIDES_DIR, id)).isDirectory()) continue;
  const title = deckTitle(id);
  const routes = [
    { route: `s/${id}`, noindex: false, canonical: `${SITE}/slides/s/${id}/` },
    { route: `s/${id}/presenter`, noindex: true, canonical: `${SITE}/slides/s/${id}/` },
  ];
  for (const { route, noindex, canonical } of routes) {
    const dir = resolve(TARGET, route);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      resolve(dir, 'index.html'),
      injectSeo(
        raw,
        headTags({
          title: `${title}｜${HOME_TITLE}`,
          description: `${title} —— ${HOME_DESCRIPTION}`,
          canonical,
          noindex,
        }),
      ),
    );
    console.log(`slides route → /slides/${route}/`);
  }
}
console.log(`slides → ${TARGET}`);
