import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { memoryOwnership } from '../bots/deletion.js';
import { TeamError } from '../team/error.js';
import { accountMemoryPath } from './space-memory.js';
import { canonicalPath, within } from './space-paths.js';

export function accountSpacePath(home: string, humanId: string): string {
  return dirname(dirname(dirname(accountMemoryPath(realpathSync(home), humanId, 'placeholder'))));
}
export function accountSpaceFiles(home: string, humanId: string) {
  const root = accountSpacePath(home, humanId);
  const files: {
    path: string;
    kind: 'directory' | 'file' | 'link';
    size: number;
    modified: number;
    device: number;
    inode: number;
  }[] = [];
  if (!existsSync(root)) return files;
  if (realpathSync(root) !== root) throw new TeamError('grant-protected-path');
  const visit = (path: string) => {
    const stat = lstatSync(path);
    files.push({
      path: relative(root, path),
      kind: stat.isSymbolicLink() ? 'link' : stat.isDirectory() ? 'directory' : 'file',
      size: stat.size,
      modified: stat.mtimeMs,
      device: stat.dev,
      inode: stat.ino,
    });
    if (stat.isDirectory()) for (const name of readdirSync(path).sort()) visit(join(path, name));
  };
  for (const name of readdirSync(root).sort()) visit(join(root, name));
  return files;
}
export function removeAccountSpace(home: string, humanId: string): void {
  const path = accountSpacePath(home, humanId);
  if (!existsSync(path)) return;
  if (realpathSync(path) !== path) throw new TeamError('grant-protected-path');
  rmSync(path, { recursive: true });
}
const moveSchema = z.object({
  source: z.string(),
  target: z.string(),
  device: z.number(),
  inode: z.number(),
});
type Move = z.infer<typeof moveSchema>;
function undo(moves: Move[]): void {
  for (const move of [...moves].reverse()) {
    if (existsSync(move.source)) continue;
    if (!existsSync(move.target)) throw new Error('space-transfer-path-missing');
    const stat = lstatSync(move.target);
    if (stat.dev !== move.device || stat.ino !== move.inode)
      throw new Error('space-transfer-identity-changed');
    mkdirSync(dirname(move.source), { recursive: true });
    if (canonicalPath(dirname(move.source)) !== dirname(move.source))
      throw new Error('space-transfer-path-unsafe');
    renameSync(move.target, move.source);
  }
}
export function recoverSpaceTransfers(db: OperationalDatabaseModulePort): void {
  const rows = z
    .array(z.object({ human_id: z.string(), moves_json: z.string() }))
    .parse(
      db.read((connection) => connection.prepare('SELECT * FROM workspace_file_transfers').all()),
    );
  for (const row of rows) {
    undo(z.array(moveSchema).parse(JSON.parse(row.moves_json)));
    db.transaction(
      (connection) =>
        connection
          .prepare('DELETE FROM workspace_file_transfers WHERE human_id = ?')
          .run(row.human_id),
      ['workspace-spaces'],
    );
  }
}
export function prepareSpaceTransfer(
  db: OperationalDatabaseModulePort,
  home: string,
  humanId: string,
  targetHumanId: string,
  slugs: string[],
) {
  const sourceRoot = accountSpacePath(home, humanId);
  const targetRoot = accountSpacePath(home, targetHumanId);
  const moves: Move[] = [];
  const add = (source: string, target: string) => {
    if (!existsSync(source)) return;
    if (canonicalPath(source) !== source || canonicalPath(dirname(target)) !== dirname(target))
      throw new TeamError('grant-protected-path');
    if (existsSync(target)) {
      if (
        lstatSync(source).isDirectory() &&
        lstatSync(target).isDirectory() &&
        canonicalPath(target) === target
      ) {
        for (const name of readdirSync(source).sort()) add(join(source, name), join(target, name));
        return;
      }
      throw new TeamError('space-name-taken');
    }
    const stat = lstatSync(source);
    moves.push({ source, target, device: stat.dev, inode: stat.ino });
  };
  if (existsSync(sourceRoot))
    for (const name of readdirSync(sourceRoot).sort()) {
      if (name !== 'bots') add(join(sourceRoot, name), join(targetRoot, name));
    }
  const memories = slugs.map((slug) => {
    const record = z
      .object({ body: z.string() })
      .parse(
        db.read((connection) =>
          connection.prepare('SELECT body FROM persona_bots WHERE slug = ?').get(slug),
        ),
      );
    const memory =
      z.object({ memoryDir: z.string().optional() }).parse(JSON.parse(record.body)).memoryDir ??
      accountMemoryPath(home, humanId, slug);
    if (!within(sourceRoot, canonicalPath(memory))) throw new TeamError('grant-protected-path');
    const target = accountMemoryPath(home, targetHumanId, slug);
    if (existsSync(memory)) {
      const proof = memoryOwnership(memory);
      const retained = db.read((connection) =>
        connection
          .prepare('SELECT body FROM persona_bot_memory_ownership WHERE slug = ?')
          .get(slug),
      );
      if (!retained || JSON.stringify(proof) !== String(retained.body))
        throw new TeamError('grant-protected-path');
      if (memory === accountMemoryPath(home, humanId, slug)) add(dirname(memory), dirname(target));
      else add(memory, target);
    }
    return { slug, target };
  });
  db.transaction(
    (connection) =>
      connection
        .prepare('INSERT INTO workspace_file_transfers VALUES (?, ?)')
        .run(humanId, JSON.stringify(moves)),
    ['workspace-spaces'],
  );
  try {
    for (const move of moves) {
      mkdirSync(dirname(move.target), { recursive: true });
      if (realpathSync(dirname(move.target)) !== dirname(move.target))
        throw new TeamError('grant-protected-path');
      renameSync(move.source, move.target);
    }
  } catch (error) {
    undo(moves);
    db.transaction(
      (connection) =>
        connection.prepare('DELETE FROM workspace_file_transfers WHERE human_id = ?').run(humanId),
      ['workspace-spaces'],
    );
    throw error;
  }
  return {
    commit(connection: DatabaseSync) {
      for (const memory of memories) {
        connection
          .prepare("UPDATE persona_bots SET body = json_set(body, '$.memoryDir', ?) WHERE slug = ?")
          .run(memory.target, memory.slug);
        if (existsSync(memory.target))
          connection
            .prepare('UPDATE persona_bot_memory_ownership SET body = ? WHERE slug = ?')
            .run(JSON.stringify(memoryOwnership(memory.target)), memory.slug);
      }
      connection
        .prepare(`UPDATE workspace_grants SET revoked_at = COALESCE(revoked_at, ?)
        WHERE bot_slug IN (SELECT value FROM json_each(?))`)
        .run(new Date().toISOString(), JSON.stringify(slugs));
      connection.prepare('DELETE FROM workspace_file_transfers WHERE human_id = ?').run(humanId);
    },
    rollback() {
      undo(moves);
      db.transaction(
        (connection) =>
          connection
            .prepare('DELETE FROM workspace_file_transfers WHERE human_id = ?')
            .run(humanId),
        ['workspace-spaces'],
      );
    },
  };
}
