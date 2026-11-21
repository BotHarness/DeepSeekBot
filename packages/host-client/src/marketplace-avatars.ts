import type {
  MarketplaceAvatarApplyCandidate,
  MarketplaceAvatarEdit,
  MarketplaceAvatarPublish,
  MarketplaceAvatarQuery,
} from '@botharness/host-protocol/marketplace-avatar';
import { parseChallenge } from '../../core/src/marketplace/altcha';
import {
  parseAuthorAccount,
  parseAvatarListing,
  parseAvatarPage,
  parseAvatarTags,
} from '../../core/src/marketplace/client';
import type { MarketplaceAccount } from '../../core/src/marketplace/uploaded-bots';
import { HostAnswerInvalid, optional, record, text, type HostCall } from './host-answer';

function requireAnswer<T>(value: T | undefined, method: string): T {
  if (value === undefined) throw new HostAnswerInvalid(`${method} returned an invalid answer.`);
  return value;
}

function isCandidate(value: unknown): value is MarketplaceAvatarApplyCandidate {
  const row = record(value);
  return (
    row !== undefined &&
    text(row['slug']) &&
    text(row['displayName']) &&
    typeof row['hasAppearance'] === 'boolean' &&
    optional(row['avatar'], text) &&
    optional(row['avatarSeed'], (seed) => seed === 2)
  );
}

function parseAccount(value: unknown): MarketplaceAccount | undefined {
  const body = record(value);
  if (!body) return;
  const { signedIn, issue, email } = body;
  const author = body['author'] === null ? null : parseAuthorAccount(body['author']);
  if (typeof signedIn !== 'boolean' || author === undefined) return;
  return {
    signedIn,
    author,
    ...(typeof issue === 'string' ? { issue } : {}),
    ...(typeof email === 'string' ? { email } : {}),
  };
}

export async function loadMarketplaceChallenge(host: HostCall) {
  return requireAnswer(
    parseChallenge(await host.call('marketplaceChallenge', {})),
    'marketplaceChallenge',
  );
}

export function marketplaceAvatarActions(host: HostCall) {
  return {
    async marketplaceAvatarList(query: MarketplaceAvatarQuery = {}) {
      return requireAnswer(
        parseAvatarPage(await host.call('marketplaceAvatarList', { ...query })),
        'marketplaceAvatarList',
      );
    },
    async marketplaceAvatarTags() {
      return requireAnswer(
        parseAvatarTags({ tags: await host.call('marketplaceAvatarTags', {}) }),
        'marketplaceAvatarTags',
      );
    },
    async marketplaceAvatarDetail(id: string) {
      return requireAnswer(
        parseAvatarListing(await host.call('marketplaceAvatarDetail', { id })),
        'marketplaceAvatarDetail',
      );
    },
    async marketplaceAvatarApplyCandidates() {
      const bots = record(await host.call('marketplaceAvatarApplyCandidates', {}))?.['bots'];
      if (!Array.isArray(bots) || !bots.every(isCandidate))
        throw new HostAnswerInvalid('marketplaceAvatarApplyCandidates returned invalid Bots.');
      return { bots };
    },
    async marketplaceAvatarApply(id: string, bot: string): Promise<{ applied: true }> {
      const result = record(await host.call('marketplaceAvatarApply', { id, bot }));
      if (result?.['applied'] !== true)
        throw new HostAnswerInvalid('marketplaceAvatarApply returned no receipt.');
      return { applied: true };
    },
    async marketplaceAvatarReport(id: string, altcha: string, reason?: string) {
      await host.call('marketplaceAvatarReport', {
        id,
        altcha,
        ...(reason === undefined ? {} : { reason }),
      });
    },
    async marketplaceAvatarSource(bot: string) {
      const image = record(await host.call('marketplaceAvatarSource', { bot }))?.['image'];
      if (!text(image)) throw new HostAnswerInvalid('marketplaceAvatarSource returned no image.');
      return { image };
    },
    async marketplaceAvatarPublish(input: MarketplaceAvatarPublish) {
      return requireAnswer(
        parseAvatarListing(await host.call('marketplaceAvatarPublish', { ...input })),
        'marketplaceAvatarPublish',
      );
    },
    async marketplaceAvatarMine() {
      const result = record(await host.call('marketplaceAvatarMine', {}));
      const { avatars } = requireAnswer(
        parseAvatarPage({ avatars: result?.['avatars'], nextCursor: null }),
        'marketplaceAvatarMine',
      );
      return { avatars };
    },
    async marketplaceAvatarEdit(id: string, patch: MarketplaceAvatarEdit) {
      return requireAnswer(
        parseAvatarListing(await host.call('marketplaceAvatarEdit', { id, ...patch })),
        'marketplaceAvatarEdit',
      );
    },
    async marketplaceAvatarDelete(id: string): Promise<{ deleted: true }> {
      const result = record(await host.call('marketplaceAvatarDelete', { id }));
      if (result?.['deleted'] !== true)
        throw new HostAnswerInvalid('marketplaceAvatarDelete returned no receipt.');
      return { deleted: true };
    },
    async marketplaceAccount() {
      return requireAnswer(
        parseAccount(await host.call('marketplaceAccount', {})),
        'marketplaceAccount',
      );
    },
    async marketplaceAuthorSave(displayName: string, acceptTerms: boolean) {
      return requireAnswer(
        parseAuthorAccount(await host.call('marketplaceAuthorSave', { displayName, acceptTerms })),
        'marketplaceAuthorSave',
      );
    },
  };
}
