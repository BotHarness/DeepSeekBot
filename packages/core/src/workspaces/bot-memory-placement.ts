import { existsSync, rmdirSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { OperationalDatabaseError } from '../database/owner.js';
import type { BotVisibility } from '../team/bot-contract.js';
import { botVisibilitySchema } from '../team/bot-contract.js';
import { TeamError } from '../team/error.js';
import { accountMemoryPath, defaultSpaceMemoryPath, botMemorySpaceId } from './space-memory.js';
import { prepareBotMemoryTransfer, recoverSpaceTransfers } from './space-lifecycle.js';
import { canonicalPath, within } from './space-paths.js';

export class BotMemoryPlacement {
  constructor(
    private readonly db: OperationalDatabaseModulePort,
    readonly home: string,
  ) {}

  plan(slug: string, owner: string, visibility: BotVisibility) {
    const row = z
      .object({ memory: z.string().nullable(), kind: z.enum(['private', 'public']) })
      .parse(
        this.db.read((db) =>
          db
            .prepare(
              "SELECT json_extract(body,'$.memoryDir') AS memory,json_extract(visibility_json,'$.kind') AS kind FROM persona_bots WHERE slug=?",
            )
            .get(slug),
        ),
      );
    const source = canonicalPath(
      row.memory ?? defaultSpaceMemoryPath(this.db, this.home, owner, slug),
    );
    const spaceId = visibility.kind === 'public' ? botMemorySpaceId(slug) : 'spaces/' + owner;
    const target =
      visibility.kind === 'public'
        ? join(this.home, spaceId, 'bots', slug, 'memory')
        : row.kind === 'private'
          ? source
          : accountMemoryPath(this.home, owner, slug);
    return {
      slug,
      owner,
      visibility,
      spaceId,
      source,
      target,
      preview: {
        from: within(this.home, source)
          ? relative(this.home, source).replaceAll('\\', '/')
          : 'custom/' + slug + '/memory',
        to: relative(this.home, target).replaceAll('\\', '/'),
      },
    };
  }

  prepare(plan: ReturnType<BotMemoryPlacement['plan']>) {
    const { slug, source, target, spaceId, visibility } = plan;
    recoverSpaceTransfers(this.db, 'bot-memory/' + slug);
    if (canonicalPath(dirname(target)) !== dirname(target))
      throw new TeamError('grant-protected-path');
    if (visibility.kind === 'public' && source !== target) {
      const root = join(this.home, spaceId);
      for (const [path, allowed] of [
        [root, 'bots'],
        [join(root, 'bots'), slug],
        [dirname(target), 'memory'],
      ] as const)
        if (existsSync(path) && readdirSync(path).some((name) => name !== allowed))
          throw new TeamError('space-name-taken');
    }
    const move =
      source === target ? undefined : prepareBotMemoryTransfer(this.db, slug, source, target);
    return {
      commit: (db: DatabaseSync) => {
        move?.commit(db);
        if (visibility.kind === 'public')
          db.prepare(`INSERT INTO workspace_spaces VALUES (?,'shared',?,NULL,?)
            ON CONFLICT(space_id) DO UPDATE SET audience_json=excluded.audience_json`).run(
            spaceId,
            '\u0000' + spaceId,
            JSON.stringify(visibility.audience),
          );
        else {
          db.prepare('DELETE FROM workspace_spaces WHERE space_id=?').run(botMemorySpaceId(slug));
          db.prepare(
            'UPDATE workspace_grants SET revoked_at=COALESCE(revoked_at,?) WHERE workspace_id=?',
          ).run(new Date().toISOString(), botMemorySpaceId(slug));
        }
      },
      rollback: () => move?.rollback(),
      finish: () => {
        const complete = move?.finish() ?? true;
        if (complete && visibility.kind === 'private') this.removeEmptyRoot(slug);
        return complete;
      },
    };
  }

  cleanupErased(slug: string): void {
    const erased = this.db.read((db) =>
      db
        .prepare(`SELECT 1 FROM persona_bot_deletions d JOIN workspace_spaces s ON s.space_id=?
      WHERE d.slug=? AND json_extract(d.body,'$.phase')='complete' AND json_extract(d.body,'$.memory')='erased'`)
        .get(botMemorySpaceId(slug), slug),
    );
    if (!erased || existsSync(join(this.home, botMemorySpaceId(slug), 'bots', slug, 'memory')))
      return;
    this.db.transaction(
      (db) =>
        db.prepare('DELETE FROM workspace_spaces WHERE space_id=?').run(botMemorySpaceId(slug)),
      ['workspace-spaces'],
    );
    this.removeEmptyRoot(slug);
  }

  private removeEmptyRoot(slug: string): void {
    const root = join(this.home, botMemorySpaceId(slug));
    for (const path of [join(root, 'bots', slug), join(root, 'bots'), root]) {
      if (canonicalPath(path) !== path) throw new TeamError('grant-protected-path');
      try {
        rmdirSync(path);
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !('code' in error) ||
          !['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(String(error.code))
        )
          throw error;
      }
    }
  }
}

export function reconcilePublicBotMemories(db: OperationalDatabaseModulePort, home: string): void {
  const placement = new BotMemoryPlacement(db, home);
  const rows = z
    .array(
      z.object({
        slug: z.string(),
        owner: z.string(),
        visibility: z.string(),
        memory: z.string().nullable(),
        audience: z.string().nullable(),
      }),
    )
    .parse(
      db.read((db) =>
        db
          .prepare(`SELECT slug,owner_human_id AS owner,visibility_json AS visibility,json_extract(body,'$.memoryDir') AS memory,
        (SELECT audience_json FROM workspace_spaces WHERE space_id='shared/.bot-'||b.slug) AS audience FROM persona_bots b
      WHERE json_extract(visibility_json,'$.kind')='public'
      AND NOT EXISTS (SELECT 1 FROM persona_bot_deletions d WHERE d.slug=b.slug)`)
          .all(),
      ),
    );
  for (const row of rows) {
    const visibility = botVisibilitySchema.parse(JSON.parse(row.visibility));
    if (
      visibility.kind === 'public' &&
      row.memory === join(home, botMemorySpaceId(row.slug), 'bots', row.slug, 'memory') &&
      row.audience === JSON.stringify(visibility.audience)
    )
      continue;
    const plan = placement.plan(
      row.slug,
      row.owner,
      botVisibilitySchema.parse(JSON.parse(row.visibility)),
    );
    const move = placement.prepare(plan);
    try {
      db.transaction((sql) => move.commit(sql), ['bot-registry', 'workspace-spaces']);
    } catch (error) {
      if (!(error instanceof OperationalDatabaseError && error.code === 'post-commit-interrupted'))
        move.rollback();
      throw error;
    }
    move.finish();
  }
}
