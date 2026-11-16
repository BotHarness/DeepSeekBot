import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { shownHostName } from '../../../../apps/mobile/src/ui/design/host-look.js';
import { space } from './ds/tokens.stylex.js';
import { HostGlyph } from './host-glyph.js';
import { useHostLook } from './host-looks.js';

const styles = stylex.create({
  row: { display: 'flex', alignItems: 'center', gap: space.x2, minWidth: 0 },
  name: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
});

export function TargetName({
  hostId,
  name,
  glyph = true,
}: {
  hostId: string;
  name: string;
  glyph?: boolean;
}): ReactElement {
  const look = useHostLook(hostId);
  if (!glyph) return <>{shownHostName(look, name)}</>;
  return (
    <span {...stylex.props(styles.row)}>
      <HostGlyph look={look} />
      <span {...stylex.props(styles.name)}>{shownHostName(look, name)}</span>
    </span>
  );
}
