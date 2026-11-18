import type { ReactNode } from 'react';

import * as stylex from '@stylexjs/stylex';

import { Tooltip } from './ds/tooltip.js';
import { color, radius, space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import type { TranscriptBlock } from './session-transcript-view.js';

const NAV_MIN_TURNS = 3;

const styles = stylex.create({
  nav: {
    position: 'absolute',
    insetInlineEnd: space.x1,
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 2,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: space.x1,
    maxHeight: '50%',
    overflow: 'hidden',
  },
  tick: {
    display: 'block',
    width: space.x4,
    height: space.x1,
    borderRadius: radius.xs,
    backgroundColor: { default: color.border, ':hover': color.muted },
  },
  tickTarget: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingBlock: space.x1,
    paddingInlineStart: space.x3,
    cursor: 'pointer',
  },
});

export function TurnNav({
  blocks,
  t,
}: {
  blocks: readonly TranscriptBlock[];
  t: BotHarnessTranslate;
}): ReactNode {
  const anchors = blocks.flatMap((block, index) => {
    if (block.kind !== 'turn') return [];
    const input = blocks[index - 1];
    const prompt =
      input?.kind === 'input' ? input.item.text.split('\n', 1)[0]?.slice(0, 80) : undefined;
    return [{ number: block.number, prompt }];
  });
  if (anchors.length < NAV_MIN_TURNS) return null;
  const jump = (number: number, target: HTMLElement): void => {
    const root = target.closest('[data-session-detail]');
    root
      ?.querySelector(`[data-transcript-turn="${number}"]`)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  return (
    <nav
      aria-label={t('sessions.detail.nav.label')}
      data-session-nav=""
      {...stylex.props(styles.nav)}
    >
      {anchors.map((anchor) => (
        <Tooltip
          key={anchor.number}
          label={anchor.prompt ?? t('sessions.detail.nav.jump', { turn: anchor.number })}
          side="left"
        >
          <span
            role="link"
            tabIndex={0}
            aria-label={t('sessions.detail.nav.jump', { turn: anchor.number })}
            data-nav-turn={anchor.number}
            onClick={(event) => jump(anchor.number, event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                jump(anchor.number, event.currentTarget);
              }
            }}
            {...stylex.props(styles.tickTarget)}
          >
            <span {...stylex.props(styles.tick)} />
          </span>
        </Tooltip>
      ))}
    </nav>
  );
}
