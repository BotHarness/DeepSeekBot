import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { readChannels } from '@botharness/host-client/channel-management';
import type { ChannelListItem } from '@botharness/host-protocol/wire';
import { bridgeHost, type BridgeCall } from '../bridge.js';
import { Button } from '../ds/button.js';
import { PanelEmptyState } from '../ds/empty-state.js';
import { Icon } from '../ds/icon.js';
import { NavItem } from '../ds/nav-item.js';
import { Note } from '../ds/note.js';
import { Tag } from '../ds/tag.js';
import type { BotHarnessTranslate } from '../locale.js';
import { useMountedResource } from '../mounted-resource.js';
import { loadChannelAccess, type ChannelVisibility } from '../team-channels-bridge.js';
import { CHANNEL_TABS, type ChannelTabId } from './channel-tabs.js';
import { DetailColumn, EmptyDetail, ListColumn, PanelGap } from './frame.js';

const styles = stylex.create({ contents: { display: 'contents' } });

type Visibility = ChannelVisibility['kind'];
type Filter = Visibility | 'all';

interface Entry extends ChannelListItem {
  readonly visibility?: Visibility | undefined;
}

const VISIBILITY_LABEL = {
  public: 'channelAccess.public',
  roles: 'channelAccess.roles',
  private: 'channelAccess.private',
} as const;

function channelIcon(entry: Entry): string {
  return entry.visibility === 'private' ? 'lock' : 'hash';
}

export function ChannelsSection({
  call,
  t,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
}): ReactElement {
  const [channels, setChannels] = useState<readonly Entry[]>([]);
  const [bots, setBots] = useState<ReadonlyMap<string, string>>(new Map());
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<ChannelTabId>('members');
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void readChannels(bridgeHost(call, signal))
      .then(async (items) => {
        const names = new Map(
          items.flatMap((item) =>
            item.type === 'dm' && item.botSlug !== undefined ? [[item.botSlug, item.name]] : [],
          ) as [string, string][],
        );
        const groups = await Promise.all(
          items
            .filter((item) => item.type === 'group')
            .map(async (item): Promise<Entry> => {
              const access = await loadChannelAccess(call, item.id, signal).catch(() => undefined);
              return access === undefined ? item : { ...item, visibility: access.visibility.kind };
            }),
        );
        if (signal.aborted) return;
        setBots(names);
        setChannels(groups);
        setFailed(false);
        setReady(true);
      })
      .catch(() => {
        if (!signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [call, attempt]);
  const needle = query.trim().toLocaleLowerCase();
  const visible = channels.filter(
    (item) =>
      (filter === 'all' || filter === item.visibility) &&
      (needle === '' || item.name.toLocaleLowerCase().includes(needle)),
  );
  const active = visible.find((item) => item.id === selected) ?? visible[0];
  const botName = (slug: string): string => bots.get(slug) ?? slug;
  const summary = (item: Entry): string =>
    [
      t('team.workbench.channels.headcount', { people: item.humanMembers?.length ?? 0 }),
      ...item.members.map(botName),
    ].join(' · ');
  return (
    <div ref={mount} {...stylex.props(styles.contents)} data-panel-columns="">
      <ListColumn<Filter>
        title={t('team.workbench.channels.title')}
        count={ready ? channels.length : undefined}
        search={{ label: t('team.workbench.channels.search'), value: query, onChange: setQuery }}
        filter={{
          label: t('channelAccess.visibility'),
          value: filter,
          onChange: setFilter,
          options: [
            { value: 'all', label: t('team.workbench.channels.all'), icon: null },
            { value: 'public', label: t('channelAccess.public'), icon: null },
            { value: 'roles', label: t('channelAccess.roles'), icon: null },
            { value: 'private', label: t('channelAccess.private'), icon: null },
          ],
        }}
        status={
          failed ? (
            <Note tone="danger">
              {t('team.error.load')}
              <Button
                size="sm"
                variant="outline"
                data-team-channels-retry=""
                onClick={() => {
                  setFailed(false);
                  setAttempt((value) => value + 1);
                }}
              >
                {t('team.workbench.retry')}
              </Button>
            </Note>
          ) : !ready ? (
            <PanelEmptyState icon="hash">{t('team.workbench.loading')}</PanelEmptyState>
          ) : visible.length === 0 ? (
            <PanelEmptyState icon="hash">{t('team.workbench.channels.empty')}</PanelEmptyState>
          ) : undefined
        }
      >
        {visible.map((item) => (
          <li key={item.id}>
            <NavItem
              icon={<Icon name={channelIcon(item)} />}
              label={
                <>
                  {item.name}{' '}
                  {item.visibility === undefined ? null : (
                    <Tag>{t(VISIBILITY_LABEL[item.visibility])}</Tag>
                  )}
                </>
              }
              description={summary(item)}
              multiline
              current={item.id === active?.id}
              data={{ 'data-team-channel': item.id }}
              onSelect={() => setSelected(item.id)}
            />
          </li>
        ))}
      </ListColumn>
      <PanelGap />
      {active === undefined ? (
        <EmptyDetail icon="hash">{t('team.workbench.channels.pick')}</EmptyDetail>
      ) : (
        <DetailColumn<ChannelTabId>
          icon={<Icon name={channelIcon(active)} />}
          title={active.name}
          meta={
            active.visibility === undefined ? undefined : (
              <Tag tone="quiet">{t(VISIBILITY_LABEL[active.visibility])}</Tag>
            )
          }
          tabs={CHANNEL_TABS.map((item) => {
            const count = item.count(active);
            const label = t(item.label);
            return {
              id: item.id,
              label: count === undefined ? label : `${label} ${count}`,
              render: () => item.render({ call, t, channel: active, botName }),
            };
          })}
          tab={tab}
          onTab={setTab}
          data={{ 'data-team-channel-detail': active.id }}
        />
      )}
    </div>
  );
}
