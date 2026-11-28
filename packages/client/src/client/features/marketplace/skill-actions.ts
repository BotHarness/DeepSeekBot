import { marketplaceSkillUploadActions } from '@botharness/host-client/marketplace-skills';
import type { HostCall } from '@botharness/host-client/host-answer';
import {
  parseMarketplaceSkill,
  type MarketplaceSkill,
  type MarketplaceSkillAddCandidates,
  type MarketplaceSkillAddedList,
  type MarketplaceSkillAddResult,
  type MarketplaceSkillConflictChoice,
  type MarketplaceSkillDetail,
  type MarketplaceSkillPage,
  type MarketplaceSkillPublication,
  type MarketplaceSkillReplacement,
  type MarketplaceSkillReview,
  type MarketplaceSkillTargets,
} from '@botharness/host-protocol/marketplace-skill';
import type { InvokeAction } from '../../actions.js';

export const SKILL_RANKINGS = ['hot', 'new', 'rising'] as const;

export interface MarketplaceSkillSection {
  section: (typeof SKILL_RANKINGS)[number];
  entries: { skill: MarketplaceSkill; score: number }[];
}

function parseSections(value: unknown): MarketplaceSkillSection[] {
  const sections = (value as { sections?: unknown } | null)?.sections ?? value;
  if (!Array.isArray(sections)) return [];
  return SKILL_RANKINGS.map((name) => {
    const found = (sections as unknown[]).find(
      (item) => (item as { section?: unknown } | null)?.section === name,
    ) as { entries?: unknown } | undefined;
    const entries = Array.isArray(found?.entries) ? (found.entries as unknown[]) : [];
    return {
      section: name,
      entries: entries.flatMap((item) => {
        const skill = parseMarketplaceSkill((item as { skill?: unknown } | null)?.skill);
        const score = (item as { score?: unknown } | null)?.score;
        return skill === undefined ? [] : [{ skill, score: typeof score === 'number' ? score : 0 }];
      }),
    };
  });
}

export interface MarketplaceSkillActions {
  marketplaceSkillAdded(): Promise<MarketplaceSkillAddedList>;
  marketplaceSkillSections(): Promise<MarketplaceSkillSection[]>;
  marketplaceSkillList(query?: { q?: string; cursor?: string }): Promise<MarketplaceSkillPage>;
  marketplaceSkillDetail(id: string): Promise<MarketplaceSkillDetail>;
  marketplaceSkillAddCandidates(): Promise<MarketplaceSkillAddCandidates>;
  marketplaceSkillReview(id: string): Promise<MarketplaceSkillReview>;
  marketplaceSkillAdd(
    id: string,
    reviewId: string,
    targets: MarketplaceSkillTargets,
    onConflict?: MarketplaceSkillConflictChoice,
  ): Promise<MarketplaceSkillAddResult>;
  marketplaceSkillPublish(input: MarketplaceSkillPublication): Promise<MarketplaceSkill>;
  marketplaceSkillReplace(input: MarketplaceSkillReplacement): Promise<MarketplaceSkill>;
  marketplaceSkillMine(): Promise<{ skills: MarketplaceSkill[] }>;
  marketplaceSkillDelete(id: string): Promise<{ deleted: true }>;
  marketplaceSkillReport(id: string, altcha: string, reason?: string): Promise<void>;
}

export function createMarketplaceSkillActions(
  invoke: InvokeAction,
  host: HostCall,
): MarketplaceSkillActions {
  return {
    ...marketplaceSkillUploadActions(host),
    marketplaceSkillList: (query = {}) =>
      invoke('marketplaceSkillList', {
        ...(query.q === undefined || query.q === '' ? {} : { q: query.q }),
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      }),
    marketplaceSkillDetail: (id) => invoke('marketplaceSkillDetail', { id }),
    marketplaceSkillAdded: () => invoke('marketplaceSkillAdded', {}),
    marketplaceSkillSections: () =>
      invoke<unknown>('marketplaceSkillSections', {}).then(parseSections, () => []),
    marketplaceSkillAddCandidates: () => invoke('marketplaceSkillAddCandidates', {}),
    marketplaceSkillReview: (id) => invoke('marketplaceSkillReview', { id }),
    marketplaceSkillAdd: (id, reviewId, targets, onConflict) =>
      invoke('marketplaceSkillAdd', {
        id,
        reviewId,
        ...(targets.bots.length === 0 ? {} : { bots: targets.bots }),
        ...(targets.global ? { global: true } : {}),
        ...(onConflict === undefined ? {} : { onConflict }),
      }),
  };
}
