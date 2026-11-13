import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeCall } from './bridge.js';
import { EmptyState } from './ds/empty-state.js';
import { FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { joinPublicChannel, loadPublicChannels, type PublicChannel } from './team-bridge.js';
import { teamErrorText } from './team-settings.js';

const styles = stylex.create({
  list: {
    display: 'flex',
    flexDirection: 'column',
    margin: 0,
    padding: 0,
    listStyle: 'none',
    minWidth: 0,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minHeight: '48px',
    paddingBlock: space.x2,
    paddingInline: space.x2,
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
  },
  body: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: space.x1 },
  name: {
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    fontWeight: text.strong,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  meta: {
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  joined: { color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
});

type Load =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; channels: readonly PublicChannel[] };

export function PublicChannelsDialog({
  call,
  t,
  onClose,
  onJoined,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  onClose(): void;
  onJoined(channelId: string): void;
}): ReactElement {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [joining, setJoining] = useState<string>();
  const [error, setError] = useState<string>();

  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    loadPublicChannels(call, controller.signal)
      .then((channels) => {
        if (!controller.signal.aborted) setLoad({ state: 'ready', channels });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ state: 'failed' });
      });
    return () => controller.abort();
  }, [call]);

  const join = (channel: PublicChannel): void => {
    setJoining(channel.channelId);
    setError(undefined);
    joinPublicChannel(call, channel.channelId)
      .then(() => onJoined(channel.channelId))
      .catch((failure: unknown) => {
        setError(teamErrorText(t, failure));
        setJoining(undefined);
      });
  };

  return (
    <FormDialog
      title={t('team.channels.title')}
      size="medium"
      labels={{ close: t('common.close'), cancel: t('common.close') }}
      submitLabel=""
      onCancel={onClose}
      onClose={onClose}
      showCancel={false}
      scroll
      error={error === undefined ? undefined : <Note tone="danger">{error}</Note>}
    >
      <div ref={mount}>
        {load.state === 'loading' ? (
          <Note>{t('team.channels.loading')}</Note>
        ) : load.state === 'failed' ? (
          <Note tone="danger">{t('team.channels.loadFailed')}</Note>
        ) : load.channels.length === 0 ? (
          <EmptyState title={t('team.channels.empty')} />
        ) : (
          <ul {...stylex.props(styles.list)} aria-label={t('team.channels.title')}>
            {load.channels.map((channel) => (
              <li
                key={channel.channelId}
                data-public-channel={channel.channelId}
                {...stylex.props(styles.row)}
              >
                <span {...stylex.props(styles.body)}>
                  <span {...stylex.props(styles.name)}>{channel.name}</span>
                  <span {...stylex.props(styles.meta)}>
                    {[
                      channel.memberCount === 1
                        ? t('team.channels.oneMember')
                        : t('team.channels.members', { count: String(channel.memberCount) }),
                      channel.description,
                    ]
                      .filter((part) => part !== undefined && part.length > 0)
                      .join(' · ')}
                  </span>
                </span>
                {channel.joined ? (
                  <span {...stylex.props(styles.joined)}>{t('team.channels.joined')}</span>
                ) : (
                  <Button
                    variant="outline"
                    disabled={joining !== undefined}
                    aria-busy={joining === channel.channelId || undefined}
                    aria-label={t('team.channels.joinNamed', { name: channel.name })}
                    onClick={() => join(channel)}
                  >
                    {t('team.channels.join')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </FormDialog>
  );
}
