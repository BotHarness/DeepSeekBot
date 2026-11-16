import { existsSync, mkdirSync, realpathSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { memoryOwnership } from '../bots/deletion.js';
import {
  memoryProofSchema,
  relocationProofSchema,
  prepareMemoryCopy,
  retireMemoryCopy,
  type MemoryCopyJournal,
} from './space-memory-copy.js';
import { canonicalPath } from './space-paths.js';

const proofSchema = memoryProofSchema;
const moveSchema = z.object({
  slug: z.string(),
  source: z.string().nullable(),
  target: z.string().nullable(),
  proof_json: z.string().nullable(),
});
function copyJournal(db: OperationalDatabaseModulePort, slug: string): MemoryCopyJournal {
  return {
    save: (proof) =>
      db.transaction(
        (connection) =>
          connection
            .prepare('UPDATE workspace_memory_moves SET proof_json = ? WHERE slug = ?')
            .run(JSON.stringify(proof), slug),
        ['workspace-spaces'],
      ),
    remove: () =>
      db.transaction(
        (connection) =>
          connection.prepare('DELETE FROM workspace_memory_moves WHERE slug = ?').run(slug),
        ['workspace-spaces'],
      ),
  };
}

export function accountMemoryPath(home: string, humanId: string, slug: string): string {
  for (const segment of [humanId, slug])
    if (!segment || segment === '.' || segment === '..' || /[/\\\u0000]/u.test(segment))
      throw new Error('invalid-space-path');
  return join(home, 'spaces', humanId, 'bots', slug, 'memory');
}

export function defaultSpaceMemoryPath(
  db: OperationalDatabaseModulePort,
  home: string,
  humanId: string,
  slug: string,
): string {
  const owner = z
    .object({ owner_human_id: z.string(), existing: z.string().nullable() })
    .parse(
      db.read((connection) =>
        connection
          .prepare(
            `SELECT owner_human_id, (SELECT json_extract(body, '$.path') FROM persona_bot_memory_ownership WHERE slug = ?) AS existing FROM team_settings WHERE singleton = 1`,
          )
          .get(slug),
      ),
    );
  const shared = join(home, botMemorySpaceId(slug), 'bots', slug, 'memory');
  if (owner.existing === shared) return shared;
  const account = accountMemoryPath(home, humanId, slug);
  const legacy = join(home, 'botharness', 'bots', slug, 'memory');
  if (owner.existing === account || owner.existing === legacy) return owner.existing;
  return humanId === owner.owner_human_id ? legacy : account;
}

export function relocateSpaceMemories(db: OperationalDatabaseModulePort, home: string): void {
  const ownerMoves = z.array(moveSchema).parse(
    db.read((connection) =>
      connection
        .prepare(`
    SELECT m.* FROM workspace_memory_moves m JOIN persona_bots b USING(slug) CROSS JOIN team_settings s
    WHERE b.owner_human_id = s.owner_human_id`)
        .all(),
    ),
  );
  for (const move of ownerMoves) {
    if (move.source && move.target && !existsSync(move.source) && existsSync(move.target)) {
      if (move.proof_json === null) throw new Error('space-memory-ownership-invalid');
      const proof = proofSchema.parse(JSON.parse(move.proof_json));
      const current = memoryOwnership(move.target);
      if (
        proof.path !== canonicalPath(move.source) ||
        current.device !== proof.device ||
        current.inode !== proof.inode
      )
        throw new Error('space-memory-ownership-invalid');
      mkdirSync(dirname(proof.path), { recursive: true });
      if (realpathSync(dirname(proof.path)) !== dirname(proof.path))
        throw new Error('space-memory-target-unsafe');
      renameSync(move.target, proof.path);
    }
    db.transaction(
      (connection) =>
        connection.prepare('DELETE FROM workspace_memory_moves WHERE slug = ?').run(move.slug),
      ['workspace-spaces'],
    );
  }
  db.transaction(
    (connection) =>
      connection
        .prepare(`DELETE FROM workspace_memory_moves WHERE slug IN
    (SELECT slug FROM persona_bot_deletions WHERE json_extract(body, '$.eraseMemory') = 1)`)
        .run(),
    ['workspace-spaces'],
  );
  const moves = z
    .array(moveSchema)
    .parse(
      db.read((connection) =>
        connection.prepare('SELECT * FROM workspace_memory_moves ORDER BY slug').all(),
      ),
    );
  for (const move of moves) {
    let { source, target, proof_json: proofJson } = move;
    if (source === null || target === null) {
      const bot = z
        .object({ owner: z.string(), body: z.string() })
        .parse(
          db.read((connection) =>
            connection
              .prepare('SELECT owner_human_id AS owner, body FROM persona_bots WHERE slug = ?')
              .get(move.slug),
          ),
        );
      const record = z.object({ memoryDir: z.string().optional() }).parse(JSON.parse(bot.body));
      source = record.memoryDir ?? join(home, 'botharness', 'bots', move.slug, 'memory');
      target = accountMemoryPath(home, bot.owner, move.slug);
      const retained = db.read((connection) =>
        connection
          .prepare('SELECT body FROM persona_bot_memory_ownership WHERE slug = ?')
          .get(move.slug),
      );
      if (existsSync(source)) {
        const proof = memoryOwnership(source);
        const previous =
          retained === undefined ? undefined : proofSchema.parse(JSON.parse(String(retained.body)));
        if (record.memoryDir !== undefined && previous === undefined)
          throw new Error('space-memory-ownership-invalid');
        if (
          previous &&
          (previous.path !== proof.path ||
            previous.device !== proof.device ||
            previous.inode !== proof.inode)
        )
          throw new Error('space-memory-ownership-invalid');
        proofJson = JSON.stringify(proof);
      }
      db.transaction(
        (connection) =>
          connection
            .prepare(
              'UPDATE workspace_memory_moves SET source = ?, target = ?, proof_json = ? WHERE slug = ?',
            )
            .run(source, target, proofJson, move.slug),
        ['workspace-spaces'],
      );
    }
    let relocationProof =
      proofJson === null ? undefined : relocationProofSchema.parse(JSON.parse(proofJson));
    if (relocationProof) {
      if (relocationProof.copy)
        relocationProof = prepareMemoryCopy(
          copyJournal(db, move.slug),
          source,
          target,
          relocationProof,
        );
      else {
        const current = memoryOwnership(existsSync(source) ? source : target);
        if (current.device !== relocationProof.device || current.inode !== relocationProof.inode)
          throw new Error('space-memory-ownership-invalid');
        if (existsSync(source) && source !== target) {
          if (existsSync(target)) throw new Error('space-memory-target-exists');
          mkdirSync(dirname(target), { recursive: true });
          if (realpathSync(dirname(target)) !== dirname(target))
            throw new Error('space-memory-target-unsafe');
          try {
            renameSync(source, target);
          } catch (error) {
            if (!(error instanceof Error) || !('code' in error) || error.code !== 'EXDEV')
              throw error;
            relocationProof = prepareMemoryCopy(
              copyJournal(db, move.slug),
              source,
              target,
              relocationProof,
            );
          }
        }
      }
    } else if (existsSync(target)) throw new Error('space-memory-target-exists');
    const finalProof = proofJson === null ? undefined : memoryOwnership(target);
    db.transaction(
      (connection) => {
        connection
          .prepare("UPDATE persona_bots SET body = json_set(body, '$.memoryDir', ?) WHERE slug = ?")
          .run(target, move.slug);
        if (finalProof)
          connection
            .prepare(`INSERT INTO persona_bot_memory_ownership VALUES (?, ?)
        ON CONFLICT(slug) DO UPDATE SET body = excluded.body`)
            .run(move.slug, JSON.stringify(finalProof));
        connection
          .prepare(
            "UPDATE persona_bot_deletions SET body = json_set(body, '$.memoryDir', ?) WHERE slug = ?",
          )
          .run(target, move.slug);
        if (finalProof)
          connection
            .prepare(
              "UPDATE persona_bot_deletions SET body = json_set(body, '$.ownership', json(?)) WHERE slug = ?",
            )
            .run(JSON.stringify(finalProof), move.slug);
        if (!relocationProof?.copy)
          connection.prepare('DELETE FROM workspace_memory_moves WHERE slug = ?').run(move.slug);
      },
      ['workspace-spaces', 'bot-registry'],
    );
    if (relocationProof?.copy)
      retireMemoryCopy(copyJournal(db, move.slug), source, relocationProof);
  }
}

export const botMemorySpaceId = (slug: string): string => 'shared/.bot-' + slug;
export const isBotMemorySpace = (id: string): boolean => id.startsWith('shared/.bot-');
