import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './activity-idle-report.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const mapDirectory = '.agents/skills/verify-deepseekbot/features';
export const inventoryPath = 'scripts/verification-inventory.json';
export const categories = [
  'mapped',
  'historical-regression',
  'superseded',
  'needs-repair',
  'undetermined',
];
const sha = (value) => /^[a-f0-9]{40}$/u.test(value ?? '');
const text = (value) => typeof value === 'string' && value.trim().length > 0;

function localFile(repo, path) {
  if (!text(path) || path.includes('#')) return false;
  const absolute = resolve(repo, path);
  return absolute.startsWith(`${resolve(repo)}${sep}`) && existsSync(absolute);
}

export function auditInventory(
  repo = root,
  inventory = JSON.parse(readFileSync(resolve(repo, inventoryPath), 'utf8')),
) {
  const errors = [];
  const available = readdirSync(resolve(repo, 'scripts'))
    .filter((name) => /^e2e-.*\.mjs$/u.test(name))
    .map((name) => `scripts/${name}`)
    .sort();
  const documents = readdirSync(resolve(repo, mapDirectory))
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .map((name) => `${mapDirectory}/${name}`)
    .sort();
  if (inventory.version !== 1 || !sha(inventory.auditedBase) || !text(inventory.boundary))
    errors.push('Invalid inventory version, audited base or boundary');
  const behaviors = Array.isArray(inventory.behaviors) ? inventory.behaviors : [];
  const scripts = Array.isArray(inventory.scripts) ? inventory.scripts : [];
  if (!behaviors.length || !scripts.length)
    errors.push('Inventory must contain behaviors and scripts');
  const ids = new Set();
  const mapped = new Set();
  const documentScripts = new Map(
    documents.map((path) => [
      path,
      new Set(
        [
          ...readFileSync(resolve(repo, path), 'utf8').matchAll(/\bscripts\/e2e-[\w.-]+\.mjs\b/gu),
        ].map(([match]) => match),
      ),
    ]),
  );
  for (const paths of documentScripts.values()) for (const path of paths) mapped.add(path);
  for (const row of behaviors) {
    if (!/^[a-z][a-z0-9.-]+$/u.test(row.id ?? '') || ids.has(row.id))
      errors.push(`Invalid or duplicate behavior ID: ${row.id}`);
    ids.add(row.id);
    if (!text(row.label) || !localFile(repo, row.source))
      errors.push(`${row.id}: missing label/source link`);
    if (!Number.isSafeInteger(row.task) || row.task < 1)
      errors.push(`${row.id}: missing associated task`);
    if (row.guide ? !documents.includes(row.guide) : !text(row.gap))
      errors.push(`${row.id}: broken guide or missing specific gap`);
  }
  for (const document of documents)
    if (!behaviors.some((row) => row.guide === document))
      errors.push(`Uninventoried feature document: ${document}`);
  for (const row of inventory.native ?? []) {
    if (
      !Number.isSafeInteger(row.task) ||
      !sha(row.sourceCommit) ||
      !sha(row.evidenceCommit) ||
      !text(row.device) ||
      !text(row.scope) ||
      !text(row.unverified) ||
      !/^https:\/\/github\.com\/BotHarness\/DeepSeekBot\/(?:blob|issues)\//u.test(row.url ?? '')
    )
      errors.push('Invalid native provenance link, SHA, device or limits');
  }
  const seen = new Set();
  for (const row of scripts) {
    if (seen.has(row.path)) errors.push(`Duplicate script classification: ${row.path}`);
    seen.add(row.path);
    if (!available.includes(row.path)) errors.push(`Deleted/missing script: ${row.path}`);
    else if (row.sha256 !== digest(readFileSync(resolve(repo, row.path))))
      errors.push(`${row.path}: source changed; re-audit classification and affected journeys`);
    if (!categories.includes(row.category)) errors.push(`${row.path}: invalid category`);
    if (!text(row.reason) || !Number.isSafeInteger(row.task) || row.task < 1)
      errors.push(`${row.path}: missing audit reason/task`);
    if (
      !Array.isArray(row.behaviors) ||
      !row.behaviors.length ||
      row.behaviors.some((id) => !ids.has(id))
    )
      errors.push(`${row.path}: unknown/missing behavior association`);
    if (row.category === 'mapped' && !mapped.has(row.path))
      errors.push(`${row.path}: mapped classification has no feature-map reference`);
    if (
      row.category === 'superseded' &&
      (!available.includes(row.replacement) || row.replacement === row.path)
    )
      errors.push(`${row.path}: missing replacement script`);
    if (row.category === 'mapped')
      for (const id of row.behaviors ?? []) {
        const guide = behaviors.find((entry) => entry.id === id)?.guide;
        if (!documentScripts.get(guide)?.has(row.path))
          errors.push(`${row.path}: mapped behavior ${id} is not referenced by its guide`);
      }
  }
  for (const path of available)
    if (!seen.has(path)) errors.push(`Unclassified new script: ${path}`);
  for (const path of mapped)
    if (!scripts.some((row) => row.path === path && row.category === 'mapped'))
      errors.push(`Feature-map script has no mapped classification: ${path}`);
  return {
    ok: errors.length === 0,
    errors,
    inventory,
    available,
    documents,
    mapped: [...mapped].sort(),
  };
}
