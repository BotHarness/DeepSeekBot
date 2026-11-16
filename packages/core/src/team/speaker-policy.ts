import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { resolveBehaviorPermissions } from '../messaging/behavior-policy.js';
import { rolePolicySchema } from './bot-contract.js';
import type { TeamRoles } from './roles.js';
import type { HumanContext } from '../humans/context.js';
import { TeamError } from './error.js';

const role = z.object({
  roleId: z.string(),
  name: z.string(),
  revision: z.number(),
  policy: z.string().transform((v) => rolePolicySchema.parse(JSON.parse(v))),
});
export class SpeakerPolicy {
  constructor(
    private readonly db: OperationalDatabaseModulePort,
    private readonly roles: TeamRoles,
  ) {}
  forHuman(humanId: string, topic?: string) {
    const human = z
      .object({ displayName: z.string() })
      .safeParse(
        this.db.read((db) =>
          db
            .prepare(
              "SELECT COALESCE(n.default_display_name,h.display_name) AS displayName FROM humans h LEFT JOIN local_human_names n USING(human_id) WHERE h.human_id = ? AND h.status = 'active'",
            )
            .get(humanId),
        ),
      );
    if (!human.success) throw new TeamError('member-not-found');
    const roles = z.array(role).parse(
      this.db.read((db) =>
        db
          .prepare(`SELECT r.role_id AS roleId, r.name, r.policy_revision AS revision, r.policy_json AS policy
      FROM host_roles r JOIN human_roles m USING(role_id) WHERE m.human_id = ? ORDER BY r.role_id`)
          .all(humanId),
      ),
    );
    const topics = [...new Set(roles.flatMap((r) => r.policy.map((p) => p.topic)))].filter(
      (t) => topic === undefined || t === topic,
    );
    const items = topics.map((t) => ({
      id: t,
      botSlug: '',
      name: t,
      behavior: roles
        .flatMap((r) => r.policy.filter((p) => p.topic === t).map((p) => p.text))
        .join('\n'),
      revision: 1,
      createdAt: '',
      updatedAt: '',
    }));
    const resolved = resolveBehaviorPermissions(
      items,
      roles.map((r) => ({
        id: r.roleId,
        name: r.name,
        revision: r.revision,
        behaviorAllow: r.policy.filter((p) => p.effect === 'allow').map((p) => p.topic),
        behaviorDeny: r.policy.filter((p) => p.effect === 'deny').map((p) => p.topic),
      })),
    );
    return { humanId, displayName: human.data.displayName, roles, resolved };
  }
  conflicts(actor: HumanContext, humanId: string) {
    this.roles.require(actor, 'members.manage', 'roles.manage');
    const { resolved } = this.forHuman(humanId);
    return resolved.flatMap((p) =>
      p.sources
        .filter((s) => s.effect === 'allow')
        .flatMap((a) =>
          p.sources
            .filter((s) => s.effect === 'deny')
            .map((d) => ({
              topic: p.id,
              allowRole: { roleId: a.id, name: a.name },
              denyRole: { roleId: d.id, name: d.name },
            })),
        ),
    );
  }
  envelope(sessionId: string, humanId: string, body: string, pending = new Map<string, number>()) {
    const speaker = this.forHuman(humanId);
    const applied = new Map(
      z
        .array(z.object({ role_id: z.string(), revision: z.number() }))
        .parse(
          this.db.read((db) =>
            db
              .prepare(
                'SELECT role_id, revision FROM session_speaker_policies WHERE session_id = ?',
              )
              .all(sessionId),
          ),
        )
        .map((r) => [r.role_id, r.revision]),
    );
    const attachments = speaker.roles.filter(
      (r) => (pending.get(r.roleId) ?? applied.get(r.roleId)) !== r.revision,
    );
    for (const role of attachments) pending.set(role.roleId, role.revision);
    let committed = false;
    const clean = (value: string) => value.replace(/[\[\]\r\n\u0000-\u001f]/gu, ' ');
    return {
      text:
        `[${clean(speaker.displayName)}${speaker.roles.length ? ' · ' + speaker.roles.map((r) => clean(r.name)).join(', ') : ''}]\n` +
        (attachments.length
          ? `[Speaker policies: latest revision wins; Deny wins]\n${JSON.stringify(attachments)}\n`
          : '') +
        body,
      commit: () => {
        if (committed || !attachments.length) return;
        this.db.transaction(
          (db) => {
            for (const r of attachments)
              db.prepare(
                'INSERT INTO session_speaker_policies VALUES (?, ?, ?) ON CONFLICT(session_id, role_id) DO UPDATE SET revision = MAX(session_speaker_policies.revision, excluded.revision)',
              ).run(sessionId, r.roleId, r.revision);
          },
          ['speaker-policy'],
        );
        committed = true;
      },
    };
  }
}
