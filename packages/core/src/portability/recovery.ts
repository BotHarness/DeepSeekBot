import { randomUUID } from 'node:crypto';
import { attachOperationalModule, type OperationalDatabaseOwner } from '../database/owner.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { ModelCatalog } from '../models/catalog.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import { ProfileBackupError } from './files.js';

const AUTHORIZE_WHERE =
  'Open Settings → Environment backup, choose Authorize model for this Bot, then Activate Bot';

export function createProfileRecovery(
  database: OperationalDatabaseOwner,
  registry: PersonaBotRegistry,
  ownership: SessionOwnership,
) {
  const port = attachOperationalModule(database, 'profile-portability');
  const row = (slug: string) =>
    port.read((db) =>
      db.prepare('SELECT * FROM profile_recovery_bots WHERE bot_slug = ?').get(slug),
    );
  const receipt = () =>
    database.mode === 'ready'
      ? port.read((db) => {
          const result = db.prepare('SELECT body FROM profile_recovery WHERE singleton = 1').get();
          return result === undefined ? undefined : JSON.parse(String(result.body));
        })
      : undefined;
  return {
    receipt,
    recordRestore(backupId: string) {
      const bots = registry.listHistorical();
      port.transaction((db) => {
        db.prepare(
          'INSERT INTO profile_recovery VALUES (1, ?) ON CONFLICT(singleton) DO UPDATE SET body = excluded.body',
        ).run(
          JSON.stringify({
            backupId,
            mode: 'disaster-restore',
            at: new Date().toISOString(),
            sessions: 'unsupported',
          }),
        );
        db.exec('DELETE FROM profile_recovery_bots');
        for (const bot of bots)
          db.prepare('INSERT INTO profile_recovery_bots(bot_slug, desired_json) VALUES (?, ?)').run(
            bot.slug,
            JSON.stringify(bot),
          );
      });
    },
    requireExecution(slug: string) {
      const recovery = row(slug);
      if (recovery === undefined || recovery.activated_session_id) return;
      throw new ProfileBackupError(
        'activation-required',
        `This Bot was restored from an Environment backup and is not active yet. ${AUTHORIZE_WHERE}.`,
      );
    },
    async status(catalog?: ModelCatalog) {
      const saved = receipt();
      if (saved === undefined) return { restored: false as const, bots: [] };
      const bots = await Promise.all(
        registry
          .list()
          .filter((bot) => row(bot.slug) !== undefined)
          .map(async (bot) => {
            const recovery = row(bot.slug);
            let reason: string | undefined;
            if (!bot.modelPlan) reason = 'model-plan-required';
            else if (!catalog) reason = 'model-unavailable';
            else
              try {
                await catalog.validate(bot.modelPlan.orchestrator);
              } catch {
                reason = 'model-unavailable';
              }
            if (
              !reason &&
              !recovery?.activated_session_id &&
              recovery?.authorized_plan_revision !== bot.modelPlan?.revision
            )
              reason = 'model-authorization-required';
            return {
              slug: bot.slug,
              displayName: bot.displayName,
              route: bot.modelPlan?.orchestrator,
              activated: !!recovery?.activated_session_id,
              readiness: reason ? ('blocked' as const) : ('degraded' as const),
              reason,
              sessionId: recovery?.activated_session_id as string | undefined,
            };
          }),
      );
      return { restored: true as const, receipt: saved, bots };
    },
    async authorizeModel(slug: string, catalog: ModelCatalog) {
      if (!row(slug)) throw new ProfileBackupError('invalid-input', 'Bot was not restored');
      const plan = registry.get(slug)?.modelPlan;
      if (!plan)
        throw new ProfileBackupError(
          'model-plan-required',
          'Choose an explicit Model Plan in the Bot Profile',
        );
      await catalog.validate(plan.orchestrator);
      if (registry.get(slug)?.modelPlan?.revision !== plan.revision)
        throw new ProfileBackupError('plan-changed', 'Model Plan changed; review again');
      port.transaction((db) =>
        db
          .prepare(
            'UPDATE profile_recovery_bots SET authorized_plan_revision = ? WHERE bot_slug = ?',
          )
          .run(plan.revision, slug),
      );
    },
    activate(slug: string, acknowledgeSplitBrain: boolean) {
      const recovery = row(slug);
      const bot = registry.get(slug);
      if (acknowledgeSplitBrain && bot && recovery?.activated_session_id) {
        registry.setPaused(slug, false);
        return String(recovery.activated_session_id);
      }
      if (
        !acknowledgeSplitBrain ||
        !bot ||
        !recovery ||
        !bot.modelPlan ||
        recovery.authorized_plan_revision !== bot.modelPlan.revision
      )
        throw new ProfileBackupError(
          'activation-required',
          `Disaster Restore acknowledgement and target-local model authorization are required. ${AUTHORIZE_WHERE}.`,
        );
      const sessionId = 'botharness-' + randomUUID();
      const cwdReference = registry.memoryDirFor(slug);
      port.transaction((db) => {
        ownership.claimWithin(db, {
          botSlug: slug,
          sessionId,
          rootRole: 'orchestrator',
          at: new Date().toISOString(),
          ...(cwdReference === undefined ? {} : { cwdReference }),
        });
        db.prepare(
          'UPDATE profile_recovery_bots SET activated_session_id = ? WHERE bot_slug = ?',
        ).run(sessionId, slug);
      });
      registry.setPaused(slug, false);
      return sessionId;
    },
  };
}

export type ProfileRecovery = ReturnType<typeof createProfileRecovery>;
