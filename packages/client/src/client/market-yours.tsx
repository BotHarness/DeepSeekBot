import * as stylex from '@stylexjs/stylex';
import { useState, type ReactElement } from 'react';
import type {
  MarketplaceSkill,
  MarketplaceSkillAdded,
} from '@botharness/host-protocol/marketplace-skill';

import type { BridgeActions } from './actions.js';
import { BrandLogo } from './ds/brand-logo.js';
import { Button } from './ds/button.js';
import { ListCard, ListCardItem } from './ds/list-card.js';
import { Note } from './ds/note.js';
import { space } from './ds/tobs.stylex.js';
import type { ConnectorsView } from './features/connectors/bridge.js';
import { ConnectorLogo } from './features/connectors/logos.js';
import type { BotHarnessTranslate } from './locale.js';
import { MarketSectionHead } from './market-rankings.js';
import { marketplaceError } from './marketplace-feedback.js';
import { marketplaceLanguage } from './marketplace-listing.js';
import { useMountedResource } from './mounted-resource.js';

const LOGO = 32;

const styles = stylex.create({
  mount: { display: 'contents' },
  section: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
});

export type MarketYoursActions = Pick<
  BridgeActions,
  | 'marketplaceSkillAdded'
  | 'marketplaceSkillAddCandidates'
  | 'marketplaceSkillDetail'
  | 'connectorReconnect'
  | 'connectorLogos'
>;

type Account = ConnectorsView['accounts'][number];

interface AddedSkill {
  id: string;
  name: string;
  targets: string[];
}

export function needsReconnect(account: Pick<Account, 'status'>): boolean {
  return account.status === 'expired' || account.status === 'failed';
}

export function groupAddedSkills(skills: readonly MarketplaceSkillAdded[]): AddedSkill[] {
  const byId = new Map<string, AddedSkill>();
  for (const skill of skills) {
    const entry = byId.get(skill.id) ?? { id: skill.id, name: skill.name, targets: [] };
    if (!entry.targets.includes(skill.target)) entry.targets.push(skill.target);
    byId.set(skill.id, entry);
  }
  return [...byId.values()];
}

export function targetLabels(
  names: ReadonlyMap<string, string>,
  global: string,
): (target: string) => string {
  const counts = new Map<string, number>([[global, 1]]);
  for (const name of names.values()) counts.set(name, (counts.get(name) ?? 0) + 1);
  return (target) => {
    if (target === 'global') return global;
    const name = names.get(target);
    if (name === undefined) return target;
    return (counts.get(name) ?? 0) > 1 ? `${name} (${target})` : name;
  };
}

export function MarketYours({
  actions,
  view,
  t,
  refresh,
  onOpenSkill,
  onChanged,
}: {
  actions: MarketYoursActions;
  view: ConnectorsView | undefined;
  t: BotHarnessTranslate;
  refresh: number;
  onOpenSkill: (skill: MarketplaceSkill) => void;
  onChanged: () => void;
}): ReactElement {
  const [added, setAdded] = useState<AddedSkill[]>([]);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<unknown>();
  const list = new Intl.ListFormat(marketplaceLanguage(t) === 'zh' ? 'zh-CN' : 'en', {
    style: 'narrow',
  });

  const mount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    void Promise.all([
      actions.marketplaceSkillAdded(),
      actions.marketplaceSkillAddCandidates().catch(() => ({ bots: [], global: false })),
    ]).then(
      ([found, candidates]) => {
        if (!live) return;
        setNames(new Map(candidates.bots.map((bot) => [bot.slug, bot.displayName])));
        setAdded(groupAddedSkills(found.skills));
      },
      () => {
        if (live) setAdded([]);
      },
    );
    return () => {
      live = false;
    };
  }, [actions, refresh]);

  const label = targetLabels(names, t('market.skills.globalShort'));
  const reconnect = actions.connectorReconnect;
  const stale = reconnect === undefined ? [] : (view?.accounts.filter(needsReconnect) ?? []);

  const open = (id: string) => {
    setError(undefined);
    setBusy(id);
    actions
      .marketplaceSkillDetail(id)
      .then((detail) => onOpenSkill(detail.skill), setError)
      .finally(() => setBusy(undefined));
  };

  const relink = (accountId: string) => {
    if (reconnect === undefined) return;
    setError(undefined);
    setBusy(accountId);
    reconnect(accountId)
      .then((linked) => {
        if (linked.url !== undefined) window.open(linked.url, '_blank', 'noopener,noreferrer');
        onChanged();
      }, setError)
      .finally(() => setBusy(undefined));
  };

  const byline = (kind: string, by: string) => t('market.all.byline', { kind, by });

  return (
    <div ref={mount} {...stylex.props(styles.mount)}>
      {added.length === 0 && stale.length === 0 ? null : (
        <section
          {...stylex.props(styles.section)}
          aria-label={t('market.yours')}
          data-market-yours=""
        >
          <MarketSectionHead title={t('market.yours')} target="yours" t={t} />
          <ListCard label={t('market.yours')}>
            {stale.map((account) => (
              <ListCardItem
                key={account.accountId}
                leading={
                  <ConnectorLogo
                    service={account.service}
                    size={LOGO}
                    logos={actions.connectorLogos}
                  />
                }
                title={account.name}
                summary={byline(
                  t('market.all.kind.app'),
                  t(
                    account.status === 'failed'
                      ? 'connectors.status.failed'
                      : 'connectors.status.expired',
                  ),
                )}
                trailing={
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy === account.accountId}
                    aria-label={`${t('connectors.accounts.reconnect')} ${account.name}`}
                    onClick={() => relink(account.accountId)}
                  >
                    {t('connectors.accounts.reconnect')}
                  </Button>
                }
                data={{ 'data-market-yours': 'app', 'data-connector-account': account.accountId }}
              />
            ))}
            {added.map((skill) => (
              <ListCardItem
                key={skill.id}
                leading={<BrandLogo src={undefined} size={LOGO} fallbackIcon="book-open" />}
                title={skill.name}
                summary={byline(t('market.all.kind.skill'), list.format(skill.targets.map(label)))}
                action={{
                  label: t('market.detail.open', { name: skill.name }),
                  disabled: busy === skill.id,
                  onClick: () => open(skill.id),
                }}
                data={{ 'data-market-yours': 'skill', 'data-market-skill': skill.name }}
              />
            ))}
          </ListCard>
          {error === undefined ? null : (
            <Note inset tone="danger">
              {t('market.error.load', { error: marketplaceError(error, t) })}
            </Note>
          )}
        </section>
      )}
    </div>
  );
}
