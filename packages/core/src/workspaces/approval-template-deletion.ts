import { createHash } from 'node:crypto';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { PersonaBotRecord } from '../bots/persona-bot.js';
import type { ApprovalTemplateDeletionPreview } from './approval-template-deletion-contract.js';
import {
  INHERIT_APPROVAL_TEMPLATE,
  isApprovalTemplateName,
  type ApprovalTemplateLibrary,
} from './approval-templates.js';

type Failure = {
  ok: false;
  reason:
    | 'invalid-name'
    | 'not-found'
    | 'built-in'
    | 'selection-unavailable'
    | 'confirmation-required'
    | 'changed'
    | 'unavailable'
    | 'rollback-failed';
};

export class ApprovalTemplateDeletion {
  constructor(
    private readonly library: ApprovalTemplateLibrary,
    private readonly registry: Pick<PersonaBotRegistry, 'list' | 'setApprovalTemplate'>,
    private readonly visible: (bot: PersonaBotRecord) => boolean,
  ) {}

  preview(name: string): { ok: true; preview: ApprovalTemplateDeletionPreview } | Failure {
    const result = this.plan(name);
    return result.ok ? { ok: true, preview: result.preview } : result;
  }

  private plan(
    name: string,
  ): { ok: true; preview: ApprovalTemplateDeletionPreview; inheritedBots: string[] } | Failure {
    if (!isApprovalTemplateName(name)) return { ok: false, reason: 'invalid-name' };
    try {
      const template = this.library.get(name);
      const fileIdentity =
        template === undefined ? this.library.customFileIdentity(name) : undefined;
      if (template === undefined && fileIdentity === undefined)
        return { ok: false, reason: 'not-found' };
      if (template?.builtIn) return { ok: false, reason: 'built-in' };
      const global = this.library.global();
      if (global.kind === 'invalid') return { ok: false, reason: 'selection-unavailable' };
      const before = global.kind === 'selected' ? global.name : null;
      const after = before === name ? null : before;
      const remaining = after === null ? undefined : this.library.get(after);
      const bots = this.registry.list();
      const visibleSlugs = new Set(bots.filter(this.visible).map((bot) => bot.slug));
      const affectedBots = bots
        .flatMap<ApprovalTemplateDeletionPreview['affectedBots'][number]>((bot) =>
          bot.approvalTemplate === name
            ? [{ slug: bot.slug, source: 'specific' }]
            : before === name && bot.approvalTemplate === INHERIT_APPROVAL_TEMPLATE
              ? [{ slug: bot.slug, source: 'global' }]
              : [],
        )
        .sort((a, b) => a.slug.localeCompare(b.slug));
      const impact = {
        name,
        ...(template === undefined ? { contentUnavailable: true } : {}),
        globalDefaultBefore: before,
        globalDefaultAfter: after,
        globalDefaultAvailable: remaining !== undefined,
        affectedBots,
      };
      const revision = createHash('sha256')
        .update(JSON.stringify([impact, template?.text ?? { fileIdentity }, remaining?.text]))
        .digest('hex');
      const visibleBots = affectedBots.filter((bot) => visibleSlugs.has(bot.slug));
      return {
        ok: true,
        preview: {
          ...impact,
          affectedBots: visibleBots,
          hiddenBotCount: affectedBots.length - visibleBots.length,
          revision,
        },
        inheritedBots: affectedBots
          .filter((bot) => bot.source === 'specific')
          .map((bot) => bot.slug),
      };
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
  }

  delete(
    name: string,
    confirmation: { confirmed: boolean; revision?: string },
  ): { ok: true; preview: ApprovalTemplateDeletionPreview; inheritedBots: string[] } | Failure {
    const current = this.plan(name);
    if (!current.ok) return current;
    if (!confirmation.confirmed || confirmation.revision === undefined)
      return { ok: false, reason: 'confirmation-required' };
    if (confirmation.revision !== current.preview.revision) return { ok: false, reason: 'changed' };
    const preview = current.preview;
    const changed: string[] = [];
    let globalChanged = false;
    const restore = (): boolean => {
      let restored = true;
      for (const slug of changed)
        try {
          if (!this.registry.setApprovalTemplate(slug, name).ok) restored = false;
        } catch {
          restored = false;
        }
      if (globalChanged)
        try {
          this.library.setGlobal(preview.globalDefaultBefore);
        } catch {
          restored = false;
        }
      return restored;
    };
    try {
      if (preview.globalDefaultBefore === name) {
        globalChanged = true;
        this.library.setGlobal(null);
      }
      for (const slug of current.inheritedBots) {
        changed.push(slug);
        if (!this.registry.setApprovalTemplate(slug, INHERIT_APPROVAL_TEMPLATE).ok)
          throw new Error('Approval template reference changed');
      }
      const deleted = this.library.delete(name);
      if (!deleted.ok) {
        if (!restore()) return { ok: false, reason: 'rollback-failed' };
        return { ok: false, reason: 'unavailable' };
      }
      return { ok: true, preview, inheritedBots: changed };
    } catch {
      return { ok: false, reason: restore() ? 'unavailable' : 'rollback-failed' };
    }
  }
}
