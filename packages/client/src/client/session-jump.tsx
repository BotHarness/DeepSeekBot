import type { ReactElement } from 'react';

import * as stylex from '@stylexjs/stylex';

import { IconButton } from './ds/icon-button.js';
import { color, radius, space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';

const styles = stylex.create({
  anchor: { position: 'relative', height: 0, flex: 'none', zIndex: 2 },
  floor: { position: 'absolute', insetInline: 0, bottom: 0 },
  button: {
    position: 'absolute',
    bottom: space.x3,
    right: space.x4,
    borderRadius: `calc(${radius.panel} + ${space.x3})`,
    backgroundColor: { default: color.surface, ':hover': color.hover },
  },
});

export function SessionJump({
  floating,
  t,
}: {
  floating: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <div {...stylex.props(styles.anchor, floating && styles.floor)}>
      <IconButton
        size="row"
        aria-label={t('sessions.detail.latest')}
        xstyle={styles.button}
        onClick={(event) => {
          const node = event.currentTarget
            .closest('[data-session-detail]')
            ?.querySelector<HTMLElement>('[data-session-transcript]');
          node?.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </IconButton>
    </div>
  );
}
