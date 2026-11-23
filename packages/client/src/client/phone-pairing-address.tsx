import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { teamHttpsRoute } from '@botharness/host-protocol/team-invitation';
import type { BridgeCall } from './bridge-transport.js';
import { Note } from './ds/note.js';
import { CopyChip, StatusStack } from './ds/status-block.js';
import { space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { OwnerPasswordSignInSettings } from './owner-password-sign-in-settings.js';
import { loadTeamMode } from './team-bridge.js';

const styles = stylex.create({
  section: { minWidth: 0, width: '100%', marginTop: space.x3 },
});

export function PhonePairingAddress({
  call,
  t,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
}): ReactElement {
  const [urls, setUrls] = useState<string[]>([]);
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    void loadTeamMode(call, controller.signal).then(
      ({ memberUrls }) => {
        if (!controller.signal.aborted)
          setUrls([
            ...new Set(memberUrls.filter(teamHttpsRoute).map((url) => new URL(url).origin)),
          ]);
      },
      () => {
        if (!controller.signal.aborted) setUrls([]);
      },
    );
    return () => controller.abort();
  }, [call]);
  return (
    <div ref={mount} hidden={urls.length === 0} {...stylex.props(styles.section)}>
      {urls.length > 0 ? (
        <StatusStack title={t('connections.phone.address')} data={{ 'data-phone-address': '' }}>
          <Note>{t('connections.phone.addressHint')}</Note>
          {urls.map((url) => (
            <CopyChip
              key={url}
              value={url}
              copyLabel={t('connections.phone.copyAddress')}
              copiedLabel={t('devices.pair.copied')}
            />
          ))}
          <OwnerPasswordSignInSettings call={call} t={t} showStatus />
        </StatusStack>
      ) : null}
    </div>
  );
}
