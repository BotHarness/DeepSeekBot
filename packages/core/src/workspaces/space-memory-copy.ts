import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { z } from 'zod';
import { memoryOwnership } from '../bots/deletion.js';
import { canonicalPath, within } from './space-paths.js';

export const memoryProofSchema = z.object({
  path: z.string(),
  device: z.number(),
  inode: z.number(),
});
const copyBase = z.object({ stage: z.string(), identity: memoryProofSchema });
const copySchema = z.union([
  copyBase.extend({ phase: z.literal('copying') }),
  copyBase.extend({ phase: z.enum(['ready', 'retiring']), digest: z.string() }),
  copyBase.extend({ phase: z.literal('rolling-back'), target: z.string() }),
]);
export const relocationProofSchema = memoryProofSchema.extend({ copy: copySchema.optional() });
export type RelocationProof = z.infer<typeof relocationProofSchema>;
export interface MemoryCopyJournal {
  save(proof: RelocationProof): void;
  remove(): void;
}

function sameIdentity(
  path: string,
  proof: z.infer<typeof memoryProofSchema>,
  partial = false,
): void {
  const current = memoryOwnership(path, partial);
  if (current.device !== proof.device || current.inode !== proof.inode)
    throw new Error('space-memory-ownership-invalid');
}
function digestTree(root: string): string {
  const hash = createHash('sha256');
  const buffer = Buffer.alloc(64 * 1024);
  const visit = (path: string, relative: string): void => {
    const stat = lstatSync(path);
    hash.update(JSON.stringify([relative, stat.mode]));
    if (stat.isSymbolicLink()) hash.update(JSON.stringify(readlinkSync(path)));
    else if (stat.isDirectory())
      for (const name of readdirSync(path).sort()) visit(join(path, name), relative + '/' + name);
    else if (stat.isFile()) {
      const fd = openSync(path, 'r');
      try {
        for (;;) {
          const count = readSync(fd, buffer, 0, buffer.length, null);
          if (!count) break;
          hash.update(buffer.subarray(0, count));
        }
      } finally {
        closeSync(fd);
      }
    } else throw new Error('space-memory-copy-unsupported');
  };
  visit(root, '');
  return hash.digest('hex');
}
function validateStage(stage: string, source: string, target: string): void {
  if (
    dirname(stage) !== dirname(target) ||
    !basename(stage).startsWith('.memory-copy-') ||
    canonicalPath(stage) !== stage ||
    within(stage, source) ||
    within(source, stage)
  )
    throw new Error('space-memory-target-unsafe');
}

export function prepareMemoryCopy(
  journal: MemoryCopyJournal,
  source: string,
  target: string,
  proof: RelocationProof,
): RelocationProof {
  let copy = proof.copy;
  if (copy?.phase === 'rolling-back') throw new Error('space-memory-copy-incomplete');
  if (copy) validateStage(copy.stage, source, target);
  if (!copy || copy.phase === 'copying') {
    sameIdentity(source, proof);
    if (existsSync(target)) throw new Error('space-memory-target-exists');
    if (copy && existsSync(copy.stage)) {
      sameIdentity(copy.stage, copy.identity, true);
      rmSync(copy.stage, { recursive: true });
    }
    mkdirSync(dirname(target), { recursive: true });
    if (realpathSync(dirname(target)) !== dirname(target))
      throw new Error('space-memory-target-unsafe');
    const stage = mkdtempSync(join(dirname(target), '.memory-copy-'));
    copy = { phase: 'copying', stage, identity: memoryOwnership(stage, true) };
    proof = { ...proof, copy };
    journal.save(proof);
    const digest = digestTree(source);
    cpSync(source, stage, {
      recursive: true,
      verbatimSymlinks: true,
      preserveTimestamps: true,
      errorOnExist: true,
      force: false,
    });
    chmodSync(stage, lstatSync(source).mode);
    sameIdentity(source, proof);
    if (digestTree(stage) !== digest || digestTree(source) !== digest)
      throw new Error('space-memory-copy-changed');
    copy = { phase: 'ready', stage, identity: memoryOwnership(stage), digest };
    proof = { ...proof, copy };
    journal.save(proof);
  }
  if (existsSync(target)) sameIdentity(target, copy.identity);
  else {
    sameIdentity(copy.stage, copy.identity);
    renameSync(copy.stage, target);
  }
  if (digestTree(target) !== copy.digest) throw new Error('space-memory-copy-changed');
  if (existsSync(source)) {
    sameIdentity(source, proof, copy.phase === 'retiring');
    if (copy.phase === 'ready' && digestTree(source) !== copy.digest)
      throw new Error('space-memory-copy-changed');
  }
  return proof;
}
export function retireMemoryCopy(
  journal: MemoryCopyJournal,
  source: string,
  proof: RelocationProof,
): void {
  if (!proof.copy || (proof.copy.phase !== 'ready' && proof.copy.phase !== 'retiring'))
    throw new Error('space-memory-copy-incomplete');
  if (proof.copy.phase === 'ready') {
    if (existsSync(source) && digestTree(source) !== proof.copy.digest)
      throw new Error('space-memory-copy-changed');
    proof = { ...proof, copy: { ...proof.copy, phase: 'retiring' } };
    journal.save(proof);
  }
  if (existsSync(source)) {
    sameIdentity(source, proof, true);
    rmSync(source, { recursive: true });
  }
  journal.remove();
}

export function rollbackMemoryCopy(
  journal: MemoryCopyJournal,
  source: string,
  target: string,
  proof: RelocationProof,
): void {
  let copy = proof.copy;
  if (!copy || copy.phase === 'retiring') throw new Error('space-memory-copy-not-rollbackable');
  validateStage(copy.stage, source, target);
  if (copy.phase !== 'rolling-back') {
    sameIdentity(source, proof);
    if (copy.phase === 'ready' && digestTree(source) !== copy.digest)
      throw new Error('space-memory-copy-changed');
    const paths = [target, copy.stage].filter((path) => lstatSync(path, { throwIfNoEntry: false }));
    if (paths.length > 1) throw new Error('space-memory-target-exists');
    const path = paths[0];
    if (path === undefined) {
      journal.remove();
      return;
    }
    sameIdentity(path, copy.identity, copy.phase === 'copying');
    if (copy.phase === 'copying' && path === target) throw new Error('space-memory-target-exists');
    if (copy.phase === 'ready' && digestTree(path) !== copy.digest)
      throw new Error('space-memory-copy-changed');
    copy = { phase: 'rolling-back', stage: copy.stage, identity: copy.identity, target: path };
  }
  if (copy.target !== target && copy.target !== copy.stage)
    throw new Error('space-memory-target-unsafe');
  if (lstatSync(copy.target, { throwIfNoEntry: false })) {
    sameIdentity(copy.target, copy.identity, true);
    journal.save({ ...proof, copy });
    rmSync(copy.target, { recursive: true });
  }
  journal.remove();
}
