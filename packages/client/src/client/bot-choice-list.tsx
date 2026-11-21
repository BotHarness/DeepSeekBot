import type { ReactElement, ReactNode, RefCallback } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from './ds/button.js';
import { PersonaBotAvatar } from './avatar.js';
import { edge } from './ds/tobs.stylex.js';
import { border, color, radius, size, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary } from './store.js';

const styles = stylex.create({
  results: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    minWidth: 0,
    maxHeight: `calc(7 * ${size.nav})`,
    overflowY: 'auto',
  },
  option: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    height: 'auto',
    gap: space.x3,
    width: '100%',
    minWidth: 0,
    minHeight: size.nav,
    paddingInline: space.x3,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.fg,
    fontWeight: text.regular,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    textAlign: 'start',
    outline: {
      default: 'none',
      ':focus-visible': `${border.focus} solid ${color.accent}`,
    },
    outlineOffset: `calc(-1 * ${edge.focusOffset})`,
  },
  optionOn: {
    backgroundColor: { default: color.selected, ':hover': color.selected },
  },
  optionName: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

export function BotChoiceList({
  bots,
  selected,
  onSelect,
  label,
  empty,
  t,
  disabled,
  listRef,
  data,
  optionMarker,
}: {
  bots: ReadonlyArray<
    Pick<BotSummary, 'slug' | 'displayName' | 'avatar' | 'appearance' | 'avatarSeed'>
  >;
  selected: string | undefined;
  onSelect: (slug: string) => void;
  label: string;
  empty: ReactNode;
  t: BotHarnessTranslate;
  disabled?: boolean;
  listRef?: RefCallback<HTMLDivElement>;
  data?: Readonly<Record<`data-${string}`, string>>;
  optionMarker: `data-${string}`;
}): ReactElement {
  return (
    <div ref={listRef} role="group" aria-label={label} {...data} {...stylex.props(styles.results)}>
      {bots.length === 0
        ? empty
        : bots.map((bot) => (
            <Button
              type="button"
              key={bot.slug}
              {...{ [optionMarker]: bot.slug }}
              aria-pressed={selected === bot.slug}
              disabled={disabled}
              onClick={() => onSelect(bot.slug)}
              xstyle={[styles.option, selected === bot.slug && styles.optionOn]}
            >
              <PersonaBotAvatar
                t={t}
                personaBotId={bot.slug}
                name={bot.displayName}
                src={bot.avatar}
                appearance={bot.appearance}
                avatarSeed={bot.avatarSeed}
                size={28}
              />
              <span {...stylex.props(styles.optionName)}>{bot.displayName}</span>
            </Button>
          ))}
    </div>
  );
}
