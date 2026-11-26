import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';

import {
  MARKETPLACE_SKILL_ID,
  MAX_MARKETPLACE_SKILL_QUERY,
  type MarketplaceSkillAddCandidates,
  type MarketplaceSkillAddResult,
  type MarketplaceSkillDetail,
  type MarketplaceSkillPage,
  type MarketplaceSkillReview,
} from '@botharness/host-protocol/marketplace-skill';
import { botAvatarUrl } from '../../bots/avatar-http.js';
import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import { asObject, invalidInput, type BridgeResult } from '../../bridge/method-utils.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';
import type { HumanContext } from '../../humans/context.js';
import { commitMemoryPathsAsync } from '../../memory/git.js';
import type { MarketplaceResult } from '../../marketplace/client.js';
import {
  freeSkillName,
  SkillStageError,
  skillExists,
  stageSkill,
  stagedFiles,
  writeSkill,
  type StagedSkill,
} from '../../marketplace/skill-install.js';
import type { MarketplaceSkillSource } from '../../marketplace/skill-source.js';
import { listBotSkills } from '../../skills/bot-skills.js';
import { ownsBot } from '../../team/bot-access.js';

const MAX_REVIEWS = 32;
const REVIEW_TTL_MS = 30 * 60_000;
const MAX_TARGET_BOTS = 50;
const BOT_SKILLS_DIR = join('.agents', 'skills');

export interface MarketplaceSkillsHost {
  source: MarketplaceSkillSource;
  hostSkillsDir: string;
  receipt(skillId: string, target: string): void;
}

export interface MarketplaceSkillBridgeDeps {
  marketplaceSkills?: MarketplaceSkillsHost;
}

export interface MarketplaceSkillBridgeMethods {
  marketplaceSkillList(payload: unknown): Promise<BridgeResult<MarketplaceSkillPage>>;
  marketplaceSkillDetail(payload: unknown): Promise<BridgeResult<MarketplaceSkillDetail>>;
  marketplaceSkillAddCandidates(payload: unknown): BridgeResult<MarketplaceSkillAddCandidates>;
  marketplaceSkillReview(payload: unknown): Promise<BridgeResult<MarketplaceSkillReview>>;
  marketplaceSkillAdd(payload: unknown): Promise<BridgeResult<MarketplaceSkillAddResult>>;
}

const failure = (code: string, message = code): BridgeResult<never> => ({
  ok: false,
  error: { code, message },
});

export function createMarketplaceSkillMethods(
  human: HumanContext,
  deps: MarketplaceSkillBridgeDeps &
    Pick<BridgeMethodsDeps, 'team' | 'registry' | 'skills' | 'warn'>,
  isHostOwner: () => boolean,
): MarketplaceSkillBridgeMethods {
  const { registry, team } = deps;
  const reviews = new Map<string, { staged: StagedSkill; expires: number }>();
  const active = () =>
    isHostOwner() || team === undefined || team.member(human.humanId)?.status === 'active';
  const allowed = (bot: PersonaBotRecord) => active() && ownsBot(human, bot);
  const call = async <T>(
    operation: (host: MarketplaceSkillsHost) => Promise<MarketplaceResult<T>>,
  ): Promise<BridgeResult<T>> => {
    const host = deps.marketplaceSkills;
    if (host === undefined) return failure('marketplace-unavailable');
    const result = await operation(host);
    return result.ok ? result : failure(result.code);
  };
  const validId = (payload: unknown): string | undefined => {
    const { id } = asObject(payload);
    return typeof id === 'string' && MARKETPLACE_SKILL_ID.test(id) ? id : undefined;
  };
  const botTarget = (slug: string) => {
    const bot = registry.get(slug);
    const memoryDir = bot === undefined ? undefined : registry.memoryDirFor(slug);
    return bot === undefined || memoryDir === undefined || !allowed(bot)
      ? undefined
      : { bot, memoryDir, skillsDir: join(memoryDir, BOT_SKILLS_DIR) };
  };
  const botHasSkill = async (memoryDir: string, skillsDir: string, name: string) =>
    skillExists(skillsDir, name) ||
    (await listBotSkills(memoryDir).catch(() => [])).some((skill) => skill.name === name);
  const candidates = () => registry.list().filter(allowed);

  return {
    marketplaceSkillList(payload) {
      const { q, cursor } = asObject(payload);
      if (q !== undefined && (typeof q !== 'string' || q.length > MAX_MARKETPLACE_SKILL_QUERY))
        return Promise.resolve(invalidInput('invalid query'));
      if (cursor !== undefined && (typeof cursor !== 'string' || !/^\d{1,6}$/u.test(cursor)))
        return Promise.resolve(invalidInput('invalid cursor'));
      return call((host) =>
        host.source.list({
          ...(q === undefined ? {} : { q: q.trim() }),
          ...(cursor === undefined ? {} : { cursor }),
        }),
      );
    },
    marketplaceSkillDetail(payload) {
      const id = validId(payload);
      if (id === undefined) return Promise.resolve(invalidInput('invalid Skill ID'));
      return call((host) => host.source.detail(id));
    },
    marketplaceSkillAddCandidates() {
      return {
        ok: true,
        value: {
          bots: candidates().map((bot) => ({
            slug: bot.slug,
            displayName: bot.displayName,
            ...(bot.avatar === undefined
              ? {}
              : {
                  avatar: bot.avatar.startsWith('data:image/')
                    ? botAvatarUrl(bot.slug, bot.avatar)
                    : bot.avatar,
                }),
            ...(bot.avatarSeed === undefined ? {} : { avatarSeed: bot.avatarSeed }),
          })),
          global: isHostOwner(),
        },
      };
    },
    async marketplaceSkillReview(payload) {
      const id = validId(payload);
      if (id === undefined) return invalidInput('invalid Skill ID');
      const host = deps.marketplaceSkills;
      if (host === undefined) return failure('marketplace-unavailable');
      const detail = await host.source.detail(id);
      if (!detail.ok) return failure(detail.code);
      const files = await host.source.files(
        detail.value.skill,
        detail.value.files.map((file) => file.path),
      );
      if (!files.ok) return failure(files.code);
      let staged: StagedSkill;
      try {
        staged = stageSkill(detail.value.skill, files.value);
      } catch (error) {
        if (error instanceof SkillStageError) return failure(error.code);
        throw error;
      }
      const now = Date.now();
      for (const [key, entry] of reviews) if (entry.expires < now) reviews.delete(key);
      if (reviews.size >= MAX_REVIEWS) {
        const oldest = reviews.keys().next();
        if (!oldest.done) reviews.delete(oldest.value);
      }
      const reviewId = randomUUID();
      reviews.set(reviewId, { staged, expires: now + REVIEW_TTL_MS });
      const conflicting: string[] = [];
      for (const bot of candidates()) {
        const target = botTarget(bot.slug);
        if (target && (await botHasSkill(target.memoryDir, target.skillsDir, staged.name)))
          conflicting.push(bot.slug);
      }
      return {
        ok: true,
        value: {
          reviewId,
          skill: detail.value.skill,
          verdict: staged.verdict,
          findings: staged.findings,
          scripts: staged.scripts,
          files: stagedFiles(staged),
          hash: staged.hash,
          conflicts: {
            bots: conflicting,
            global: isHostOwner() && skillExists(host.hostSkillsDir, staged.name),
          },
        },
      };
    },
    async marketplaceSkillAdd(payload) {
      const input = asObject(payload);
      const id = validId(payload);
      const { reviewId, bots, global, onConflict } = input;
      if (id === undefined || typeof reviewId !== 'string')
        return invalidInput('Skill ID and reviewId are required');
      if (
        bots !== undefined &&
        (!Array.isArray(bots) ||
          bots.length > MAX_TARGET_BOTS ||
          !bots.every((slug) => typeof slug === 'string' && slug.length > 0))
      )
        return invalidInput('bots must be a list of Bot slugs');
      if (global !== undefined && typeof global !== 'boolean')
        return invalidInput('global must be a boolean');
      if (onConflict !== undefined && onConflict !== 'replace' && onConflict !== 'rename')
        return invalidInput('onConflict must be replace or rename');
      const slugs = [...new Set((bots ?? []) as string[])];
      if (slugs.length === 0 && global !== true)
        return invalidInput('Choose at least one Bot or global');
      const host = deps.marketplaceSkills;
      if (host === undefined) return failure('marketplace-unavailable');
      const review = reviews.get(reviewId);
      if (review === undefined || review.expires < Date.now() || review.staged.skill.id !== id)
        return failure('review-expired', 'Review this Skill again before adding it.');
      const { staged } = review;
      if (staged.verdict === 'blocked')
        return failure('skill-blocked', 'This Skill failed the safety scan.');
      if (global === true && !isHostOwner())
        return failure('permission-required', 'Only the Host owner may add Host Skills');
      const targets = slugs.map((slug) => ({ slug, target: botTarget(slug) }));
      const missing = targets.find((entry) => entry.target === undefined);
      if (missing !== undefined)
        return failure('bot-not-found', `Bot unavailable: ${missing.slug}`);
      const plan: {
        target: string;
        skillsDir: string;
        memoryDir?: string;
        name: string;
        replace: boolean;
      }[] = [];
      for (const { slug, target } of targets) {
        const { memoryDir, skillsDir } = target!;
        const taken = await botHasSkill(memoryDir, skillsDir, staged.name);
        if (taken && onConflict === undefined)
          return failure('skill-exists', `${slug} already has a Skill named ${staged.name}`);
        const listed = await listBotSkills(memoryDir).catch(() => []);
        const active = listed.find((skill) => skill.name === staged.name);
        if (
          taken &&
          onConflict === 'replace' &&
          active?.path !== `.agents/skills/${staged.name}/SKILL.md`
        )
          return failure(
            'skill-exists',
            `${slug} uses a Skill named ${staged.name} from outside .agents/skills/${staged.name}; choose rename instead`,
          );
        const names = new Set(listed.map((skill) => skill.name));
        const name =
          taken && onConflict === 'rename'
            ? freeSkillName(
                staged.name,
                (candidate) => names.has(candidate) || skillExists(skillsDir, candidate),
              )
            : staged.name;
        plan.push({
          target: slug,
          skillsDir,
          memoryDir,
          name,
          replace: taken && onConflict === 'replace',
        });
      }
      if (global === true) {
        const taken = skillExists(host.hostSkillsDir, staged.name);
        if (taken && onConflict === undefined)
          return failure('skill-exists', `A Host Skill named ${staged.name} already exists`);
        plan.push({
          target: 'global',
          skillsDir: host.hostSkillsDir,
          replace: taken && onConflict === 'replace',
          name:
            taken && onConflict === 'rename'
              ? freeSkillName(staged.name, (candidate) =>
                  skillExists(host.hostSkillsDir, candidate),
                )
              : staged.name,
        });
      }
      const added: MarketplaceSkillAddResult['added'] = [];
      for (const step of plan) {
        let written: string | undefined;
        try {
          const path = await writeSkill(staged, step.skillsDir, step.name, {
            replace: step.replace,
          });
          written = step.replace ? undefined : path;
          if (step.memoryDir !== undefined) {
            const relative = `.agents/skills/${step.name}`;
            await commitMemoryPathsAsync(
              step.memoryDir,
              [relative],
              `skills: add ${step.name} from Marketplace (${staged.skill.fullName})`,
            );
            deps.skills?.invalidateMemory(step.target);
            added.push({ target: step.target, name: step.name, path: relative });
          } else {
            deps.skills?.invalidateHost();
            added.push({ target: 'global', name: step.name, path });
          }
          host.receipt(staged.skill.id, step.target);
        } catch (error) {
          if (error instanceof SkillStageError && error.code === 'skill-exists')
            return failure(
              'skill-exists',
              `${step.target} already has a Skill named ${step.name}; added ${added.length} target(s) first`,
            );
          if (written !== undefined && step.memoryDir !== undefined)
            await rm(written, { recursive: true, force: true }).catch(() => undefined);
          deps.warn?.(
            JSON.stringify({
              module: 'marketplace-skill',
              initiator: 'client',
              phase: 'write-failed',
              reason: error instanceof Error ? error.name : 'unknown',
            }),
          );
          return failure(
            'skill-write-failed',
            `Adding ${staged.name} to ${step.target} failed after ${added.length} target(s)`,
          );
        }
      }
      return { ok: true, value: { name: staged.name, added } };
    },
  };
}
