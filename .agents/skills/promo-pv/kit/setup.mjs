#!/usr/bin/env node
// new PV workspace outside the repo: node .agents/skills/promo-pv/kit/setup.mjs ~/promo/<name>
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const kit = dirname(fileURLToPath(import.meta.url));
const skill = resolve(kit, '..');
const repo = resolve(skill, '../../..');
const dest = resolve(process.argv[2] || 'promo-pv');
for (const d of ['kit', 'lib', 'assets', 'out', 'sfx']) mkdirSync(join(dest, d), { recursive: true });
for (const f of ['globals.js', 'motion.js', 'pixel-cosmos.js', 'boot.js', 'render.cjs', 'preview.cjs', 'render-all.sh', 'sheet.py', 'mix.py', 'sfx.py', 'beats.py']) cpSync(join(kit, f), join(dest, 'kit', f));
cpSync(join(kit, 'stage.html'), join(dest, 'index.html'));
if (!existsSync(join(dest, 'scenes.js'))) cpSync(join(kit, 'example-scenes.js'), join(dest, 'scenes.js'));
if (!existsSync(join(dest, 'beats.js'))) writeFileSync(join(dest, 'beats.js'), `const BEATS = ${JSON.stringify(Array.from({ length: 64 }, (_, i) => +(0.5 + i * 0.5).toFixed(3)))};\nconst KICKS = [];\nconst SAX = [];\nconst END = 24;\n`);
cpSync(join(skill, 'assets', 'tobs-logo.png'), join(dest, 'assets', 'tobs-logo.png'));

const req = createRequire(join(repo, 'packages/core/package.json'));
const avatarEntry = req.resolve('@botharness/pixel-avatar');
const pnpm = join(repo, 'node_modules/.pnpm');
const esb = readdirSync(pnpm).filter(n => n.startsWith('esbuild@')).sort().pop();
if (!esb) throw new Error('esbuild not found under node_modules/.pnpm; run pnpm install in the repo first');
const { buildSync } = createRequire(join(pnpm, esb, 'node_modules/esbuild/package.json'))('esbuild');
buildSync({ entryPoints: [avatarEntry], bundle: true, format: 'iife', globalName: 'PX', outfile: join(dest, 'lib/pixel-avatar.js'), logLevel: 'warning' });

if (!existsSync(join(dest, 'node_modules/geist'))) execSync('npm install --no-save --no-audit --no-fund geist@1', { cwd: dest, stdio: 'inherit' });
execSync(`python3 ${join(dest, 'kit/sfx.py')} ${join(dest, 'sfx')}`, { stdio: 'inherit' });
console.log(`ready: ${dest}\n  cd ${dest} && python3 -m http.server 8777 &\n  node kit/preview.cjs 1,4,8 out/pv && python3 kit/sheet.py out/pv out/sheet.jpg`);
