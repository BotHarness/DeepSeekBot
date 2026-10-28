import type { ReactElement, ReactNode, RefCallback } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, IconChevronLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

import { border, color, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
  },
  hidden: { display: 'none' },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    minWidth: 0,
    paddingBlock: space.x2,
    paddingInline: space.x3,
    borderBottomWidth: border.hairline,
    borderBottomStyle: 'solid',
    borderBottomColor: color.divider,
    flexShrink: 0,
  },
  title: {
    flexGrow: 1,
    minWidth: 0,
    margin: 0,
    overflow: 'hidden',
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x4,
    flexGrow: 1,
    minWidth: 0,
    minHeight: 0,
    padding: space.x4,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    boxSizing: 'border-box',
  },
  foot: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space.x3,
    paddingBlock: space.x3,
    paddingInline: space.x4,
    borderTopWidth: border.hairline,
    borderTopStyle: 'solid',
    borderTopColor: color.divider,
    flexShrink: 0,
  },
  spacer: { flexGrow: 1 },
});

export function useKeptScroll<T extends HTMLElement>(): RefCallback<T> {
  return useMountedResource<T>((node) => {
    let kept = node.scrollTop;
    const save = (): void => {
      if (node.clientHeight > 0) kept = node.scrollTop;
    };
    const restore = (): void => {
      if (node.clientHeight > 0 && node.scrollTop !== kept) node.scrollTop = kept;
    };
    node.addEventListener('scroll', save, { passive: true });
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(restore);
    observer?.observe(node);
    return () => {
      node.removeEventListener('scroll', save);
      observer?.disconnect();
    };
  }, []);
}

export function MarketPage({
  page,
  title,
  hidden,
  t,
  onBack,
  actions,
  secondary,
  pageRef,
  children,
}: {
  readonly page: string;
  readonly title: string;
  readonly hidden: boolean;
  readonly t: BotHarnessTranslate;
  readonly onBack: () => void;
  readonly actions?: ReactNode;
  readonly secondary?: ReactNode;
  readonly pageRef?: RefCallback<HTMLElement>;
  readonly children: ReactNode;
}): ReactElement {
  const keep = useKeptScroll<HTMLDivElement>();
  return (
    <section
      {...stylex.props(styles.page, hidden && styles.hidden)}
      ref={pageRef}
      aria-label={title}
      aria-hidden={hidden || undefined}
      data-market-page={page}
    >
      <header {...stylex.props(styles.head)}>
        <Button
          size="sm"
          variant="ghost"
          aria-label={t('market.back')}
          data-market-back
          onClick={onBack}
        >
          <IconChevronLeftOutlineRegular size={16} />
        </Button>
        <h2 {...stylex.props(styles.title)}>{title}</h2>
      </header>
      <div {...stylex.props(styles.body)} ref={keep}>
        {children}
      </div>
      {actions === undefined && secondary === undefined ? null : (
        <footer {...stylex.props(styles.foot)}>
          {secondary}
          {secondary === undefined ? null : <span {...stylex.props(styles.spacer)} />}
          {actions}
        </footer>
      )}
    </section>
  );
}
