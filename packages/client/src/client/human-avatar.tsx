import { useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Icon } from './ds/icon.js';
import type { HumanAvatarCache } from '@botharness/host-client/human-profile';

const styles = stylex.create({
  image: { width: '100%', height: '100%', objectFit: 'cover' },
});

const noSubscribe = () => () => undefined;
const noSnapshot = () => 0;

export function HumanAvatarImage({
  cache,
  humanId,
  version,
  fallback,
}: {
  cache: HumanAvatarCache | undefined;
  humanId: string;
  version: string | undefined;
  fallback?: ReactNode;
}): ReactElement {
  const snapshot = cache?.getSnapshot ?? noSnapshot;
  useSyncExternalStore(cache?.subscribe ?? noSubscribe, snapshot, snapshot);
  cache?.want(humanId, version);
  const src = cache?.get(humanId, version);
  return src === undefined ? (
    <>{fallback ?? <Icon name="user" />}</>
  ) : (
    <img
      src={src}
      alt=""
      draggable={false}
      data-human-avatar={humanId}
      {...stylex.props(styles.image)}
    />
  );
}
