#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = join(ROOT, '.agents', 'skills', 'dsh-plugin-dev');
const DEFAULT_TARGET = process.env.DSH_SKILL_REPO ?? resolve(ROOT, '..', 'dsh-skill');

export function readSkillProvenance() {
  const text = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)?.[1] ?? '';
  const lines = frontmatter.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === 'metadata:');
  const fields = {};
  if (start === -1) return fields;
  for (const line of lines.slice(start + 1)) {
    const match = line.match(/^\s+([A-Za-z][A-Za-z0-9]*):\s*"?(.*?)"?\s*$/);
    if (!match) break;
    fields[match[1]] = match[2];
  }
  return fields;
}

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.github') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else out.push(relative(base, full).split(sep).join('/'));
  }
  return out;
}

function checkReadme(provenance) {
  const readme = readFileSync(join(SKILL, 'README.md'), 'utf8').toLowerCase();
  const missing = ['skillVersion', 'verifiedAgainst', 'upstreamSha', 'verifiedAt'].filter(
    (key) => !readme.includes(provenance[key].toLowerCase()),
  );
  if (missing.length > 0) {
    process.stderr.write(`skill: README is missing provenance values: ${missing.join(', ')}\n`);
  }
}

function sync(target, { check }) {
  if (!existsSync(target)) {
    throw new Error(
      `skill: target ${target} does not exist — clone it first: gh repo clone BotHarness/dsh-skill ${target}`,
    );
  }

  const wanted = new Map();
  for (const rel of walk(SKILL)) wanted.set(rel, join(SKILL, rel));

  const drift = [];
  for (const [rel, source] of wanted) {
    const destination = join(target, rel);
    const same =
      existsSync(destination) && readFileSync(destination, 'utf8') === readFileSync(source, 'utf8');
    if (same) continue;
    drift.push(`${rel} (update)`);
    if (!check) {
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, readFileSync(source));
    }
  }
  for (const rel of walk(target)) {
    if (wanted.has(rel)) continue;
    drift.push(`${rel} (remove)`);
    if (!check) rmSync(join(target, rel));
  }
  return drift;
}

export function syncSkill({ target = DEFAULT_TARGET, check = false, release = false } = {}) {
  const provenance = readSkillProvenance();
  if (!provenance.skillVersion) throw new Error('skill: SKILL.md metadata.skillVersion is missing');
  checkReadme(provenance);

  const drift = sync(target, { check });
  const label = check ? 'check' : 'sync';
  if (drift.length === 0) {
    process.stdout.write(`skill ${label}: ${target} is in sync\n`);
  } else {
    for (const item of drift) process.stdout.write(`skill ${label}: ${item}\n`);
  }
  if (check) {
    if (drift.length > 0) process.exitCode = 1;
    return drift;
  }
  if (!release) return drift;

  const git = (args) =>
    execFileSync('git', args, { cwd: target, stdio: 'inherit', shell: false, windowsHide: true });
  const gitOut = (args) =>
    execFileSync('git', args, {
      cwd: target,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
    }).trim();
  git(['add', '-A']);
  if (gitOut(['status', '--porcelain']) !== '') {
    git([
      'commit',
      '-m',
      `Release v${provenance.skillVersion} (verified against ${provenance.verifiedAgainst})`,
    ]);
  }
  const tag = `v${provenance.skillVersion}`;
  if (gitOut(['tag', '--list', tag]) === '') git(['tag', tag]);
  else process.stdout.write(`skill release: tag ${tag} already exists\n`);
  process.stdout.write(
    `skill release: push with  git -C ${target} push && git -C ${target} push --tags\n`,
  );
  return drift;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const target = args.find((arg) => !arg.startsWith('--'));
  syncSkill({
    ...(target ? { target: resolve(target) } : {}),
    check: args.includes('--check'),
    release: args.includes('--release'),
  });
}
