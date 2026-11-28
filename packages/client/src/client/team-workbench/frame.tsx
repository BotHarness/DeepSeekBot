import {
  useId,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefCallback,
} from 'react';
import * as stylex from '@stylexjs/stylex';

import { ChipButton } from '../ds/chip-button.js';
import { ChipTabs } from '../ds/chip-tabs.js';
import { dimension } from '../ds/dimensions.stylex.js';
import { PanelEmptyState } from '../ds/empty-state.js';
import { SearchField } from '../ds/field.js';
import { Icon } from '../ds/icon.js';
import { IconButton } from '../ds/icon-button.js';
import { PanelHeader } from '../ds/panel-header.js';
import { ink, layer, space, type } from '../ds/tobs.stylex.js';
import { useMountedResource } from '../mounted-resource.js';

const COMPACT_WIDTH = 880;

const styles = stylex.create({
  root: {
    display: 'flex',
    height: '100%',
    minHeight: 0,
    minWidth: 0,
    color: ink.primary,
    fontSize: type.bodySize,
    lineHeight: type.bodyLine,
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    flexShrink: 0,
    width: dimension.workbenchNavWidth,
    minHeight: 0,
    overflowY: 'auto',
    boxSizing: 'border-box',
    paddingBlock: space.x3,
    paddingInline: space.x3,
  },
  navCompact: { width: 'auto', paddingInline: space.x2 },
  list: {
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    width: dimension.workbenchListWidth,
    maxWidth: '34%',
    minHeight: 0,
    minWidth: 0,
  },
  detail: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
    minWidth: 0,
  },
  tools: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    paddingBlockStart: space.x1,
    paddingBlockEnd: space.x3,
    paddingInline: space.x3,
  },
  rows: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    flexGrow: 1,
    minHeight: 0,
    overflowY: 'auto',
    margin: 0,
    paddingBlockStart: 0,
    paddingBlockEnd: space.x3,
    paddingInline: space.x3,
    listStyle: 'none',
  },
  tabs: { paddingBlockEnd: space.x3, paddingInline: space.x5 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: space.x2 },
  toolbar: { display: 'flex', flexWrap: 'wrap', gap: space.x2 },
  status: { display: 'flex', flexDirection: 'column', paddingInline: space.x3 },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x5,
    flexGrow: 1,
    minHeight: 0,
    overflowY: 'auto',
    paddingBlockStart: space.x1,
    paddingBlockEnd: space.x5,
    paddingInline: space.x5,
  },
  gap: {
    flexShrink: 0,
    flexBasis: `var(--bh-workspace-gap, ${space.x2})`,
    minWidth: space.x2,
    backgroundColor: `var(--bh-workspace-canvas, ${layer.canvas})`,
  },
  meta: { display: 'inline-flex', alignItems: 'center', gap: space.x2, minWidth: 0 },
  notice: { paddingBlockStart: space.x5 },
});

export function WorkbenchFrame({
  label,
  nav,
  navRef,
  children,
}: {
  label: string;
  navRef?: RefCallback<HTMLElement> | undefined;
  nav(compact: boolean): ReactNode;
  children: ReactNode;
}): ReactElement {
  const [compact, setCompact] = useState(false);
  const mount = useMountedResource<HTMLDivElement>((node) => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setCompact(entry.contentRect.width < COMPACT_WIDTH);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={mount} {...stylex.props(styles.root)} data-team-workbench="" data-panel-columns="">
      <nav
        ref={navRef}
        aria-label={label}
        {...stylex.props(styles.nav, compact && styles.navCompact)}
      >
        {nav(compact)}
      </nav>
      <PanelGap />
      {children}
    </div>
  );
}

export function PanelGap(): ReactElement {
  return <span aria-hidden="true" {...stylex.props(styles.gap)} />;
}

export interface ListFilter<Value extends string> {
  readonly label: string;
  readonly value: Value;
  readonly options: readonly { readonly value: Value; readonly label: string }[];
  onChange(value: Value): void;
}

function ChipFilter<Value extends string>({
  id,
  filter,
}: {
  id: string;
  filter: ListFilter<Value>;
}): ReactElement {
  const index = filter.options.findIndex((option) => option.value === filter.value);
  const move = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const count = filter.options.length;
    const next = filter.options[(index + step + count) % count];
    if (next === undefined) return;
    filter.onChange(next.value);
    event.currentTarget.ownerDocument.getElementById(`${id}-${next.value}`)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={filter.label} {...stylex.props(styles.chips)}>
      {filter.options.map((option) => {
        const checked = option.value === filter.value;
        return (
          <ChipButton
            key={option.value}
            id={`${id}-${option.value}`}
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            filled={checked}
            label={option.label}
            onKeyDown={move}
            onClick={() => filter.onChange(option.value)}
          />
        );
      })}
    </div>
  );
}

export function ListColumn<Filter extends string = never>({
  title,
  count,
  action,
  toolbar,
  search,
  filter,
  status,
  children,
}: {
  title: string;
  count?: number | undefined;
  action?: ReactNode;
  toolbar?: ReactNode;
  search?: { label: string; value: string; onChange(value: string): void } | undefined;
  filter?: ListFilter<Filter> | undefined;
  status?: ReactNode;
  children: ReactNode;
}): ReactElement {
  const filterId = useId();
  return (
    <section aria-label={title} {...stylex.props(styles.list)} data-team-list="">
      <PanelHeader
        label={title}
        badge={
          count === undefined ? undefined : <span {...stylex.props(styles.meta)}>{count}</span>
        }
        action={action}
      />
      {search === undefined && filter === undefined && toolbar === undefined ? null : (
        <div {...stylex.props(styles.tools)}>
          {toolbar === undefined ? null : <div {...stylex.props(styles.toolbar)}>{toolbar}</div>}
          {search === undefined ? null : (
            <SearchField label={search.label} value={search.value} onChange={search.onChange} />
          )}
          {filter === undefined ? null : <ChipFilter id={filterId} filter={filter} />}
        </div>
      )}
      {status === undefined ? null : <div {...stylex.props(styles.status)}>{status}</div>}
      <ul role="list" {...stylex.props(styles.rows)} data-team-rows="">
        {children}
      </ul>
    </section>
  );
}

export interface DetailTab<Id extends string> {
  readonly id: Id;
  readonly label: string;
  readonly icon?: ReactNode;
  render(): ReactNode;
}

export function DetailColumn<Tab extends string = never>({
  icon,
  title,
  back,
  meta,
  action,
  tabs,
  tab,
  onTab,
  data,
  children,
}: {
  icon?: ReactNode;
  title: string;
  back?: { readonly label: string; onBack(): void } | undefined;
  meta?: ReactNode;
  action?: ReactNode;
  tabs?: readonly DetailTab<Tab>[] | undefined;
  tab?: Tab | undefined;
  onTab?(tab: Tab): void;
  data?: Readonly<Record<`data-${string}`, string | undefined>>;
  children?: ReactNode;
}): ReactElement {
  const tabsId = useId();
  const current = tabs?.find((item) => item.id === tab) ?? tabs?.[0];
  return (
    <section aria-label={title} {...stylex.props(styles.detail)} {...data}>
      <PanelHeader
        icon={icon}
        label={
          back === undefined ? (
            title
          ) : (
            <span {...stylex.props(styles.meta)}>
              <IconButton aria-label={back.label} data-team-back="" onClick={back.onBack}>
                <Icon name="chevron-left" />
              </IconButton>
              {title}
            </span>
          )
        }
        badge={meta === undefined ? undefined : <span {...stylex.props(styles.meta)}>{meta}</span>}
        action={action}
      />
      {tabs === undefined || current === undefined ? null : (
        <div {...stylex.props(styles.tabs)}>
          <ChipTabs
            id={tabsId}
            label={title}
            value={current.id}
            options={tabs.map((item) => ({ value: item.id, label: item.label, icon: item.icon }))}
            onChange={(next) => onTab?.(next)}
          />
        </div>
      )}
      <div
        {...stylex.props(styles.body)}
        {...(current === undefined
          ? {}
          : {
              role: 'tabpanel',
              tabIndex: 0,
              id: `${tabsId}-${current.id}-panel`,
              'aria-labelledby': `${tabsId}-${current.id}`,
            })}
        data-team-detail-body={current?.id ?? ''}
      >
        {current === undefined ? children : current.render()}
      </div>
    </section>
  );
}

export function EmptyDetail({
  icon,
  action,
  data,
  children,
}: {
  icon: string;
  action?: ReactNode;
  data?: Readonly<Record<`data-${string}`, string | undefined>>;
  children: ReactNode;
}): ReactElement {
  return (
    <section {...stylex.props(styles.detail)} {...data}>
      <PanelEmptyState icon={icon} action={action}>
        {children}
      </PanelEmptyState>
    </section>
  );
}

export function DetailNotice({ children }: { children: ReactNode }): ReactElement {
  return (
    <section {...stylex.props(styles.detail)}>
      <div {...stylex.props(styles.body, styles.notice)}>{children}</div>
    </section>
  );
}
