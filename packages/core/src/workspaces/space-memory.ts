import { existsSync, mkdirSync, realpathSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { memoryOwnership } from '../bots/deletion.js';

const proofSchema = z.object({ path: z.string(), device: z.number(), inode: z.number() });
const moveSchema = z.object({
  slug: z.string(),
  source: z.string().nullable(),
  target: z.string().nullable(),
  proof_json: z.string().nullable(),
});

export function accountMemoryPath(home: string, humanId: string, slug: string): string {
  for (const segment of [humanId, slug])
    if (!segment || segment === '.' || segment === '..' || /[/\\\u0000]/u.test(segment))
      throw new Error('invalid-space-path');
  return join(home, 'spaces', humanId, 'bots', slug, 'memory');
}

export function relocateSpaceMemories(db: OperationalDatabaseModulePort, home: string): void {
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
    if (proofJson !== null) {
      const proof = proofSchema.parse(JSON.parse(proofJson));
      const current = memoryOwnership(existsSync(source) ? source : target);
      if (current.device !== proof.device || current.inode !== proof.inode)
        throw new Error('space-memory-ownership-invalid');
      if (existsSync(source) && source !== target) {
        if (existsSync(target)) throw new Error('space-memory-target-exists');
        mkdirSync(dirname(target), { recursive: true });
        if (realpathSync(dirname(target)) !== dirname(target))
          throw new Error('space-memory-target-unsafe');
        renameSync(source, target);
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
        connection.prepare('DELETE FROM workspace_memory_moves WHERE slug = ?').run(move.slug);
      },
      ['workspace-spaces', 'bot-registry'],
    );
  }
}
