import { randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { OperationalDatabaseError, type OperationalDatabaseModulePort } from '../database/owner.js';
import { memoryOwnership } from '../bots/deletion.js';
import { TeamError } from '../team/error.js';
import { accountMemoryPath, defaultSpaceMemoryPath, botMemorySpaceId } from './space-memory.js';
import { canonicalPath, within } from './space-paths.js';
import { spaceDeletionSchema, spaceDeletionKey, restoreSpaceDeletion } from './space-deletion.js';
import {
  relocationProofSchema,
  prepareMemoryCopy,
  retireMemoryCopy,
  rollbackMemoryCopy,
  type MemoryCopyJournal,
} from './space-memory-copy.js';

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
  memory: relocationProofSchema.optional(),
  botSlug: z.string().optional(),
});
type Move = z.infer<typeof moveSchema>;
const transferSchema = z.object({
  phase: z.enum(['prepared', 'committed']),
  moves: z.array(moveSchema),
});
type Transfer = z.infer<typeof transferSchema>;
function saveTransfer(db: OperationalDatabaseModulePort, key: string, transfer: Transfer): void {
  db.transaction(
    (connection) =>
      connection
        .prepare('UPDATE workspace_file_transfers SET moves_json = ? WHERE human_id = ?')
        .run(JSON.stringify(transfer), key),
    ['workspace-spaces'],
  );
}
function copyJournal(
  db: OperationalDatabaseModulePort,
  key: string,
  transfer: Transfer,
  move: Move,
): MemoryCopyJournal {
  return {
    save: (proof) => {
      move.memory = proof;
      saveTransfer(db, key, transfer);
    },
    remove: () => {
      if (move.memory) delete move.memory.copy;
      saveTransfer(db, key, transfer);
    },
  };
}
function clearTransfer(db: OperationalDatabaseModulePort, key: string): void {
  db.transaction(
    (connection) =>
      connection.prepare('DELETE FROM workspace_file_transfers WHERE human_id = ?').run(key),
    ['workspace-spaces'],
  );
}
function addMove(moves: Move[], source: string, target: string): void {
  const stat = lstatSync(source, { throwIfNoEntry: false });
  if (!stat) return;
  if (
    canonicalPath(dirname(source)) !== dirname(source) ||
    canonicalPath(dirname(target)) !== dirname(target)
  )
    throw new TeamError('grant-protected-path');
  const destination = lstatSync(target, { throwIfNoEntry: false });
  if (destination) {
    if (stat.isDirectory() && destination.isDirectory() && canonicalPath(target) === target) {
      for (const name of readdirSync(source).sort())
        addMove(moves, join(source, name), join(target, name));
      return;
    }
    throw new TeamError('space-name-taken');
  }
  moves.push({ source, target, device: stat.dev, inode: stat.ino });
}
function applyMoves(
  moves: Move[],
  journal?: { db: OperationalDatabaseModulePort; key: string; transfer: Transfer },
): void {
  for (const move of moves) {
    mkdirSync(dirname(move.target), { recursive: true });
    if (realpathSync(dirname(move.target)) !== dirname(move.target))
      throw new TeamError('grant-protected-path');
    try {
      renameSync(move.source, move.target);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'EXDEV' ||
        !move.memory ||
        !journal
      )
        throw error;
      move.memory = prepareMemoryCopy(
        copyJournal(journal.db, journal.key, journal.transfer, move),
        move.source,
        move.target,
        move.memory,
      );
    }
  }
}
function undo(
  moves: Move[],
  journal?: { db: OperationalDatabaseModulePort; key: string; transfer: Transfer },
): void {
  for (const move of [...moves].reverse()) {
    if (move.memory?.copy) {
      if (!journal) throw new Error('space-transfer-journal-missing');
      rollbackMemoryCopy(
        copyJournal(journal.db, journal.key, journal.transfer, move),
        move.source,
        move.target,
        move.memory,
      );
      continue;
    }
    if (lstatSync(move.source, { throwIfNoEntry: false })) continue;
    const stat = lstatSync(move.target, { throwIfNoEntry: false });
    if (!stat) throw new Error('space-transfer-path-missing');
    if (stat.dev !== move.device || stat.ino !== move.inode)
      throw new Error('space-transfer-identity-changed');
    mkdirSync(dirname(move.source), { recursive: true });
    if (canonicalPath(dirname(move.source)) !== dirname(move.source))
      throw new Error('space-transfer-path-unsafe');
    renameSync(move.target, move.source);
  }
}
function recoverTransfer(db: OperationalDatabaseModulePort, key: string, transfer: Transfer): void {
  if (transfer.phase === 'prepared') undo(transfer.moves, { db, key, transfer });
  else
    for (const move of transfer.moves)
      if (move.memory?.copy)
        retireMemoryCopy(copyJournal(db, key, transfer, move), move.source, move.memory);
  clearTransfer(db, key);
}
export function recoverSpaceTransfers(db: OperationalDatabaseModulePort, key?: string): void {
  const rows = z
    .array(z.object({ human_id: z.string(), moves_json: z.string() }))
    .parse(
      db.read((connection) =>
        key === undefined
          ? connection.prepare('SELECT * FROM workspace_file_transfers').all()
          : connection.prepare('SELECT * FROM workspace_file_transfers WHERE human_id=?').all(key),
      ),
    );
  for (const row of rows) {
    const deletion = spaceDeletionSchema.safeParse(JSON.parse(row.moves_json));
    if (deletion.success) {
      if (row.human_id !== spaceDeletionKey(deletion.data.row.space_id))
        throw new Error('space-deletion-journal-invalid');
      restoreSpaceDeletion(db, deletion.data.row);
      continue;
    }
    const body: unknown = JSON.parse(row.moves_json);
    const transfer = Array.isArray(body)
      ? { phase: 'prepared' as const, moves: z.array(moveSchema).parse(body) }
      : transferSchema.parse(body);
    recoverTransfer(db, row.human_id, transfer);
  }
}
export function prepareBotMemoryTransfer(
  db: OperationalDatabaseModulePort,
  slug: string,
  source: string,
  target: string,
) {
  const proof = memoryOwnership(source);
  const retained = db.read((connection) =>
    connection.prepare('SELECT body FROM persona_bot_memory_ownership WHERE slug = ?').get(slug),
  );
  if (!retained || JSON.stringify(proof) !== String(retained.body))
    throw new TeamError('grant-protected-path');
  if (existsSync(target)) throw new TeamError('space-name-taken');
  const key = 'bot-memory/' + slug;
  const move: Move = {
    source,
    target,
    device: proof.device,
    inode: proof.inode,
    memory: proof,
    botSlug: slug,
  };
  const transfer: Transfer = { phase: 'prepared', moves: [move] };
  db.transaction(
    (connection) =>
      connection
        .prepare('INSERT INTO workspace_file_transfers VALUES (?, ?)')
        .run(key, JSON.stringify(transfer)),
    ['workspace-spaces'],
  );
  try {
    applyMoves(transfer.moves, { db, key, transfer });
  } catch (error) {
    recoverTransfer(db, key, transfer);
    throw error;
  }
  return {
    commit(connection: DatabaseSync) {
      connection
        .prepare("UPDATE persona_bots SET body=json_set(body,'$.memoryDir',?) WHERE slug=?")
        .run(target, slug);
      connection
        .prepare('UPDATE persona_bot_memory_ownership SET body=? WHERE slug=?')
        .run(JSON.stringify(memoryOwnership(target)), slug);
      if (move.memory?.copy)
        connection
          .prepare('UPDATE workspace_file_transfers SET moves_json=? WHERE human_id=?')
          .run(JSON.stringify({ ...transfer, phase: 'committed' }), key);
      else connection.prepare('DELETE FROM workspace_file_transfers WHERE human_id=?').run(key);
    },
    rollback() {
      recoverTransfer(db, key, transfer);
    },
    finish(): boolean {
      if (!move.memory?.copy) return true;
      try {
        recoverTransfer(db, key, { ...transfer, phase: 'committed' });
        return true;
      } catch {
        return false;
      }
    },
  };
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
  const add = (source: string, target: string) => addMove(moves, source, target);
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
      defaultSpaceMemoryPath(db, home, humanId, slug);
    const canonical = canonicalPath(memory);
    const legacy = join(home, 'botharness', 'bots', slug, 'memory');
    const publicMemory = canonical === join(home, botMemorySpaceId(slug), 'bots', slug, 'memory');
    if (
      !within(sourceRoot, canonical) &&
      within(home, canonical) &&
      canonical !== legacy &&
      !publicMemory
    )
      throw new TeamError('grant-protected-path');
    const target = publicMemory ? memory : accountMemoryPath(home, targetHumanId, slug);
    if (existsSync(memory)) {
      const proof = memoryOwnership(memory);
      const retained = db.read((connection) =>
        connection
          .prepare('SELECT body FROM persona_bot_memory_ownership WHERE slug = ?')
          .get(slug),
      );
      if (!retained || JSON.stringify(proof) !== String(retained.body))
        throw new TeamError('grant-protected-path');
    }
    return {
      slug,
      target,
      memory,
      source: memory === accountMemoryPath(home, humanId, slug) ? dirname(memory) : memory,
      destination: memory === accountMemoryPath(home, humanId, slug) ? dirname(target) : target,
    };
  });
  const files = (source: string, target: string) => {
    if (memories.some((memory) => within(memory.source, source))) return;
    if (memories.some((memory) => within(source, memory.source))) {
      for (const name of readdirSync(source).sort()) files(join(source, name), join(target, name));
    } else add(source, target);
  };
  if (existsSync(sourceRoot))
    for (const name of readdirSync(sourceRoot).sort())
      if (name !== 'bots') files(join(sourceRoot, name), join(targetRoot, name));
  for (const memory of memories) {
    if (memory.memory === memory.target) continue;
    if (memory.source !== memory.memory && existsSync(memory.source))
      for (const name of readdirSync(memory.source).sort())
        if (name !== 'memory') add(join(memory.source, name), join(memory.destination, name));
    const offset = moves.length;
    add(memory.memory, memory.target);
    for (const move of moves.slice(offset))
      if (move.source === memory.memory) {
        move.memory = memoryOwnership(memory.memory);
        move.botSlug = memory.slug;
      }
  }
  const transfer: Transfer = { phase: 'prepared', moves };
  db.transaction(
    (connection) =>
      connection
        .prepare('INSERT INTO workspace_file_transfers VALUES (?, ?)')
        .run(humanId, JSON.stringify(transfer)),
    ['workspace-spaces'],
  );
  try {
    applyMoves(moves, { db, key: humanId, transfer });
  } catch (error) {
    undo(moves, { db, key: humanId, transfer });
    clearTransfer(db, humanId);
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
      if (moves.some((move) => move.memory?.copy))
        connection
          .prepare('UPDATE workspace_file_transfers SET moves_json = ? WHERE human_id = ?')
          .run(JSON.stringify({ ...transfer, phase: 'committed' }), humanId);
      else
        connection.prepare('DELETE FROM workspace_file_transfers WHERE human_id = ?').run(humanId);
    },
    rollback() {
      undo(moves, { db, key: humanId, transfer });
      clearTransfer(db, humanId);
    },
    finish() {
      if (moves.some((move) => move.memory?.copy))
        recoverTransfer(db, humanId, { ...transfer, phase: 'committed' });
    },
  };
}

export function relocateTobWorkspaces(db: OperationalDatabaseModulePort, home: string): void {
  const legacyRoot = join(home, 'botharness', 'tob-workspaces') + sep;
  const bots = z.array(z.object({ slug: z.string(), humanId: z.string(), body: z.string() })).parse(
    db.read((connection) =>
      connection
        .prepare(
          `WITH legacy AS (
              SELECT slug, owner_human_id, body, ? || slug AS workspace_path FROM persona_bots
            )
            SELECT b.slug, b.owner_human_id AS humanId, b.body
            FROM legacy b JOIN humans h ON h.human_id = b.owner_human_id
            WHERE EXISTS (SELECT 1 FROM json_each(b.body, '$.workspaces') w WHERE w.value = b.workspace_path)
              OR EXISTS (SELECT 1 FROM workspace_grants g WHERE g.bot_slug = b.slug AND g.revoked_at IS NULL
                AND (g.workspace_path = b.workspace_path
                  OR substr(g.workspace_path, 1, length(b.workspace_path) + 1) = b.workspace_path || ?))`,
        )
        .all(legacyRoot, sep),
    ),
  );
  const memoryPaths = z
    .array(z.object({ memory: z.string() }))
    .parse(
      db.read((connection) =>
        connection
          .prepare(
            `SELECT COALESCE(json_extract(b.body, '$.memoryDir'), json_extract(p.body, '$.path'), ?) AS memory FROM persona_bots b LEFT JOIN persona_bot_memory_ownership p USING(slug)`,
          )
          .all(''),
      ),
    )
    .map((row) => row.memory)
    .filter(Boolean)
    .map((path) => {
      try {
        return canonicalPath(path);
      } catch {
        return resolve(path);
      }
    });
  for (const bot of bots) {
    const source = join(home, 'botharness', 'tob-workspaces', bot.slug);
    const target = join(accountSpacePath(home, bot.humanId), 'files');
    const record = z.object({ workspaces: z.array(z.string()) }).parse(JSON.parse(bot.body));
    const oldGrants = z
      .array(
        z.object({
          id: z.string(),
          workspace_id: z.string(),
          workspace_path: z.string(),
          workspace_title: z.string(),
          orchestrator_write: z.number(),
        }),
      )
      .parse(
        db.read((connection) =>
          connection
            .prepare(
              `SELECT id, workspace_id, workspace_path, workspace_title, orchestrator_write FROM workspace_grants WHERE bot_slug = ? AND revoked_at IS NULL AND (workspace_path = ? OR substr(workspace_path,1,length(?)) = ?)`,
            )
            .all(bot.slug, source, source + sep, source + sep),
        ),
      );
    if (!record.workspaces.includes(source) && !oldGrants.length) continue;
    if (canonicalPath(source) !== source || canonicalPath(target) !== target)
      throw new TeamError('grant-protected-path');
    const replacements = oldGrants.map((grant) => {
      const path = join(target, relative(source, grant.workspace_path));
      if (
        !within(source, grant.workspace_path) ||
        !within(source, canonicalPath(grant.workspace_path)) ||
        !within(target, path) ||
        !within(target, canonicalPath(path))
      )
        throw new TeamError('grant-protected-path');
      return { ...grant, path, workspaceId: path === target ? 'spaces/' + bot.humanId : path };
    });
    mkdirSync(target, { recursive: true });
    const moves: Move[] = [];
    const files = (from: string, to: string) => {
      if (memoryPaths.some((memory) => within(memory, from))) return;
      if (memoryPaths.some((memory) => within(from, memory))) {
        for (const name of readdirSync(from).sort()) files(join(from, name), join(to, name));
      } else addMove(moves, from, to);
    };
    if (existsSync(source))
      for (const name of readdirSync(source).sort()) files(join(source, name), join(target, name));
    const key = 'tob-workspace/' + bot.slug;
    db.transaction(
      (connection) =>
        connection
          .prepare('INSERT INTO workspace_file_transfers VALUES (?, ?)')
          .run(key, JSON.stringify(moves)),
      ['workspace-spaces'],
    );
    try {
      applyMoves(moves);
      const workspaces = [
        ...new Set(
          record.workspaces.map((workspace) => (workspace === source ? target : workspace)),
        ),
      ];
      for (const grant of replacements)
        if (!within(target, canonicalPath(grant.path))) throw new TeamError('grant-protected-path');
      db.transaction(
        (connection) => {
          connection
            .prepare(
              "UPDATE persona_bots SET body = json_set(body, '$.workspaces', json(?)) WHERE slug = ?",
            )
            .run(JSON.stringify(workspaces), bot.slug);
          for (const grant of oldGrants)
            connection
              .prepare('UPDATE workspace_grants SET revoked_at = ? WHERE id = ?')
              .run(new Date().toISOString(), grant.id);
          for (const grant of replacements) {
            connection
              .prepare(`INSERT INTO workspace_grants (id,bot_slug,workspace_id,workspace_path,workspace_title,created_at,orchestrator_write,write_revision)
            SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM workspace_grants WHERE bot_slug = ? AND (workspace_id = ? OR workspace_path = ?))`)
              .run(
                randomUUID(),
                bot.slug,
                grant.workspaceId,
                grant.path,
                grant.workspace_title,
                new Date().toISOString(),
                grant.orchestrator_write,
                grant.orchestrator_write,
                bot.slug,
                grant.workspaceId,
                grant.path,
              );
          }
          connection.prepare('DELETE FROM workspace_file_transfers WHERE human_id = ?').run(key);
        },
        ['workspace-spaces', 'workspace-grants', 'bot-registry'],
      );
    } catch (error) {
      if (!(error instanceof OperationalDatabaseError && error.code === 'post-commit-interrupted'))
        undo(moves);
      throw error;
    }
    if (existsSync(source) && !readdirSync(source).length) rmSync(source, { recursive: true });
  }
}
