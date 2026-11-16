import type { ReactElement } from 'react';

import { shownHostName } from '../../../../apps/mobile/src/ui/design/host-look.js';
import { HostGlyph } from './host-glyph.js';
import { useHostLook } from './host-looks.js';

export function TargetName({ hostId, name }: { hostId: string; name: string }): ReactElement {
  const look = useHostLook(hostId);
  return (
    <>
      <HostGlyph look={look} /> {shownHostName(look, name)}
    </>
  );
}
