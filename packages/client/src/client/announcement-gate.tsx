import { useState, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import type { BridgeCall } from './bridge.js';
import { postRestricted } from './channel-access.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { loadChannelAccess } from './team-channels-bridge.js';
import { useTeamMode } from './team-state.js';

const styles = stylex.create({
  note: {
    margin: 0,
    paddingBlock: space.x3,
    paddingInline: space.x4,
    borderRadius: radius.lg,
    backgroundColor: color.well,
    color: color.muted,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    textAlign: 'center',
  },
});

export function AnnouncementGate({
  call,
  channelId,
  t,
  children,
}: {
  readonly call: BridgeCall | undefined;
  readonly channelId: string;
  readonly t: BotHarnessTranslate;
  readonly children: ReactNode;
}): ReactElement {
  const team = useTeamMode(call);
  const [restricted, setRestricted] = useState<{ channelId: string; value: boolean }>();
  const active = call !== undefined && team?.enabled === true;
  const mount = useMountedResource<HTMLSpanElement>(() => {
    if (!active) return undefined;
    const controller = new AbortController();
    loadChannelAccess(call, channelId, controller.signal)
      .then((access) => {
        if (!controller.signal.aborted) setRestricted({ channelId, value: postRestricted(access) });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [call, channelId, active]);
  if (active && restricted?.channelId === channelId && restricted.value)
    return (
      <p role="status" data-announcement-only="" {...stylex.props(styles.note)}>
        {t('channelAccess.announcementNote')}
      </p>
    );
  return (
    <>
      <span ref={mount} hidden />
      {children}
    </>
  );
}
