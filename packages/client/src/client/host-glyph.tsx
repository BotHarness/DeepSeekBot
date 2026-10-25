import * as stylex from '@stylexjs/stylex';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { HOST_SYMBOL_GLYPHS, useHostInk } from './host-looks.js';
import type { HostLook } from '../../../../apps/mobile/src/ui/design/host-look.js';
import { text } from './ds/tokens.stylex.js';

const styles = stylex.create({
  glyph: { display: 'inline-flex', flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: text.titleSize, lineHeight: text.metaLine },
  ink: (value: string) => ({ color: value }),
});

export function HostGlyph({ look, size: glyphSize = 16 }: { look: HostLook; size?: number }) {
  const ink = useHostInk(look.color);
  if (look.icon.kind === 'emoji')
    return (
      <span aria-hidden="true" {...stylex.props(styles.glyph, styles.emoji)}>
        {look.icon.emoji}
      </span>
    );
  return (
    <span aria-hidden="true" {...stylex.props(styles.glyph, ink !== undefined && styles.ink(ink))}>
      <ChannelSidebarIcon name={HOST_SYMBOL_GLYPHS[look.icon.id]} size={glyphSize} />
    </span>
  );
}
