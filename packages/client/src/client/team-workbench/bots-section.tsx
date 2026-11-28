import { useState, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import {
  readBotAccessDirectory,
  readBotAccessRoles,
  type BotAccessRolesView,
  type TeamAccessBot,
} from '@botharness/host-client/team-roles';
import { bridgeHost, type BridgeCall } from '../bridge.js';
import { Button } from '../ds/button.js';
import { PanelEmptyState } from '../ds/empty-state.js';
import { Icon } from '../ds/icon.js';
import { NavItem } from '../ds/nav-item.js';
import { Note } from '../ds/note.js';
import { Tag } from '../ds/tag.js';
import type { BotHarnessKey, BotHarnessTranslate } from '../locale.js';
import { useMountedResource } from '../mounted-resource.js';
import type { TeamMember, TeamModeView } from '../team-bridge.js';
import type { TeamRole } from '../team-roles-bridge.js';
import { BotRolesTab } from './bot-roles-tab.js';
import { DetailColumn, EmptyDetail, ListColumn, PanelGap } from './frame.js';

const styles = stylex.create({ contents: { display: 'contents' } });

type Audience = BotAccessRolesView['audience'];
type Filter = Audience | 'all';

export type BotTabId = 'roles';

interface Entry extends TeamAccessBot {
  readonly access?: BotAccessRolesView | undefined;
}

interface BotTab {
  readonly id: BotTabId;
  readonly label: BotHarnessKey;
  render(props: {
    t: BotHarnessTranslate;
    access: BotAccessRolesView;
    roles: readonly TeamRole[];
  }): ReactNode;
}

const BOT_TABS: readonly BotTab[] = [
  {
    id: 'roles',
    label: 'team.workbench.bots.rolesTab',
    render: (props) => <BotRolesTab {...props} />,
  },
];

export const AUDIENCE_LABEL = {
  private: 'team.workbench.bots.audience.private',
  everyone: 'team.workbench.bots.audience.everyone',
  roles: 'team.workbench.bots.audience.roles',
  members: 'team.workbench.bots.audience.members',
} as const;

const FILTERS: readonly Filter[] = ['all', 'everyone', 'roles', 'members', 'private'];

function botIcon(entry: Entry): string {
  return entry.access?.audience === 'private' ? 'lock' : 'bot';
}

export function BotsSection({
  call,
  t,
  view,
  roles,
  members,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  view: TeamModeView;
  roles: readonly TeamRole[];
  members: readonly TeamMember[];
}): ReactElement {
  const [bots, setBots] = useState<readonly Entry[]>([]);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<BotTabId>('roles');
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    const host = bridgeHost(call, controller.signal);
    void readBotAccessDirectory(host)
      .then((items) =>
        Promise.all(
          items.map(async (item): Promise<Entry> => ({
            ...item,
            access: await readBotAccessRoles(host, item.slug).catch(() => undefined),
          })),
        ),
      )
      .then((entries) => {
        if (controller.signal.aborted) return;
        setBots(entries);
        setFailed(false);
        setReady(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [call, attempt]);
  const retry = (): void => {
    setFailed(false);
    setAttempt((value) => value + 1);
  };
  const incomplete = bots.filter((item) => item.access === undefined).length;
  const needle = query.trim().toLocaleLowerCase();
  const visible = bots.filter(
    (item) =>
      (filter === 'all' || filter === item.access?.audience) &&
      (needle === '' ||
        item.displayName.toLocaleLowerCase().includes(needle) ||
        item.slug.toLocaleLowerCase().includes(needle)),
  );
  const active = visible.find((item) => item.slug === selected) ?? visible[0];
  const ownerName = (humanId: string): string | undefined =>
    humanId === view.viewer.humanId
      ? view.viewer.displayName
      : members.find((member) => member.humanId === humanId)?.displayName;
  const access = active?.access;
  const owner = access === undefined ? undefined : ownerName(access.ownerHumanId);
  const summary = (item: Entry): string => {
    const audience = item.access?.audience;
    if (audience === 'roles')
      return t('team.workbench.bots.roleCount', { count: item.access?.roles.length ?? 0 });
    if (audience === 'members')
      return t('team.workbench.bots.inviteeCount', {
        count: item.access?.invitedMembers.length ?? 0,
      });
    if (audience === 'everyone') return t('team.workbench.bots.everyoneSummary');
    if (audience === 'private') return t('team.workbench.bots.privateSummary');
    return item.slug;
  };
  return (
    <div ref={mount} {...stylex.props(styles.contents)} data-panel-columns="">
      <ListColumn<Filter>
        title={t('team.workbench.bots.title')}
        count={ready ? bots.length : undefined}
        search={{ label: t('team.workbench.bots.search'), value: query, onChange: setQuery }}
        filter={{
          label: t('team.workbench.bots.audience'),
          value: filter,
          onChange: setFilter,
          options: FILTERS.map((value) => ({
            value,
            label: t(value === 'all' ? 'team.workbench.bots.all' : AUDIENCE_LABEL[value]),
          })),
        }}
        status={
          failed ? (
            <Note tone="danger">
              {t('team.error.load')}
              <Button size="sm" variant="outline" data-team-bots-retry="" onClick={retry}>
                {t('team.workbench.retry')}
              </Button>
            </Note>
          ) : !ready ? (
            <PanelEmptyState icon="bot">{t('team.workbench.loading')}</PanelEmptyState>
          ) : incomplete > 0 ? (
            <Note tone="warning">
              {t('team.workbench.bots.incomplete', { count: incomplete })}
              <Button size="sm" variant="outline" data-team-bots-retry="" onClick={retry}>
                {t('team.workbench.retry')}
              </Button>
            </Note>
          ) : visible.length === 0 ? (
            <PanelEmptyState icon="bot">{t('team.workbench.bots.empty')}</PanelEmptyState>
          ) : undefined
        }
      >
        {visible.map((item) => (
          <li key={item.slug}>
            <NavItem
              icon={<Icon name={botIcon(item)} />}
              label={
                <>
                  {item.displayName}{' '}
                  {item.access === undefined ? null : (
                    <Tag>{t(AUDIENCE_LABEL[item.access.audience])}</Tag>
                  )}
                </>
              }
              description={summary(item)}
              multiline
              current={item.slug === active?.slug}
              data={{ 'data-team-bot': item.slug }}
              onSelect={() => setSelected(item.slug)}
            />
          </li>
        ))}
      </ListColumn>
      <PanelGap />
      {active === undefined ? (
        <EmptyDetail icon="bot">{t('team.workbench.bots.pick')}</EmptyDetail>
      ) : access === undefined ? (
        <DetailColumn icon={<Icon name="bot" />} title={active.displayName}>
          <Note tone="danger">
            {t('team.workbench.bots.accessFailed')}
            <Button size="sm" variant="outline" onClick={retry}>
              {t('team.workbench.retry')}
            </Button>
          </Note>
        </DetailColumn>
      ) : (
        <DetailColumn<BotTabId>
          icon={<Icon name={botIcon(active)} />}
          title={active.displayName}
          meta={
            <>
              <Tag tone="quiet">{t(AUDIENCE_LABEL[access.audience])}</Tag>
              {owner === undefined ? null : (
                <Tag tone="quiet">{t('team.workbench.bots.owner', { name: owner })}</Tag>
              )}
            </>
          }
          tabs={BOT_TABS.map((item) => ({
            id: item.id,
            label: t(item.label),
            render: () => item.render({ t, access, roles }),
          }))}
          tab={tab}
          onTab={setTab}
          data={{ 'data-team-bot-detail': active.slug }}
        />
      )}
    </div>
  );
}
