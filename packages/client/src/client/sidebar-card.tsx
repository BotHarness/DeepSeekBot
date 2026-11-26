import { useContext, useId, type ReactElement, type ReactNode, type Ref } from 'react';
import * as stylex from '@stylexjs/stylex';

import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { SettingsGroupContext } from './ds/settings-row.js';

const styles = stylex.create({
  inGroup: { display: 'contents', listStyle: 'none' },
  line: { position: 'relative' },
  stretch: { position: 'absolute', inset: 0 },
  stretched: { position: 'relative', pointerEvents: 'none' },
  above: { position: 'relative' },
  chipActions: { display: 'contents', pointerEvents: 'auto' },
});

function withStyle(base: string, extra: stylex.StyleXStyles | false): string {
  const added = extra === false ? undefined : stylex.props(extra).className;
  return added === undefined ? base : `${base} ${added}`;
}

export function SidebarCardList({
  label,
  className,
  listRef,
  flush = false,
  children,
}: {
  label?: string | undefined;
  className?: string | undefined;
  listRef?: Ref<HTMLUListElement> | undefined;
  flush?: boolean | undefined;
  children: ReactNode;
}): ReactElement {
  const inGroup = useContext(SettingsGroupContext);
  if (inGroup) {
    const part = stylex.props(stylex.defaultMarker(), styles.inGroup);
    return (
      <ul
        ref={listRef}
        aria-label={label}
        data-settings-part=""
        {...part}
        className={className === undefined ? part.className : `${part.className} ${className}`}
      >
        {children}
      </ul>
    );
  }
  return (
    <ul
      ref={listRef}
      data-flush={flush || undefined}
      className={className === undefined ? 'bh-card-list' : 'bh-card-list ' + className}
      aria-label={label}
    >
      {children}
    </ul>
  );
}

export interface SidebarCardRowProps {
  icon?: string | undefined;
  leading?: ReactNode | undefined;
  selection?: { checked: boolean; multiple?: boolean } | undefined;
  iconLabel?: string | undefined;
  title: ReactNode;
  titleClassName?: string | undefined;
  badge?: ReactNode | undefined;
  summary?: ReactNode | undefined;
  flipKey?: string | undefined;
  hint?: string | undefined;
  chips?: ReactNode | undefined;
  chipActions?: ReactNode | undefined;
  meta?: ReactNode | undefined;
  trailing?: ReactNode | undefined;
  trailingAlign?: 'start' | undefined;
  detail?: ReactNode | undefined;
  onClick?: () => void | undefined;
  onIntent?: (() => void) | undefined;
  disabled?: boolean | undefined;
  muted?: boolean | undefined;
  mainClassName?: string | undefined;
  dialog?: boolean | undefined;
  expanded?: boolean | undefined;
  controls?: string | undefined;
  state?: string | undefined;
  anchor?: string | undefined;
}

export function SidebarCardRow({
  icon,
  leading,
  iconLabel,
  selection,
  title,
  titleClassName,
  badge,
  summary,
  flipKey,
  hint,
  chips,
  chipActions,
  meta,
  trailing,
  trailingAlign,
  detail,
  onClick,
  onIntent,
  disabled,
  muted,
  mainClassName,
  dialog,
  expanded,
  controls,
  state,
  anchor,
}: SidebarCardRowProps): ReactElement {
  const inGroup = useContext(SettingsGroupContext);
  const titleId = useId();
  const stretched = chipActions !== undefined && onClick !== undefined && selection === undefined;
  const body = (
    <>
      {leading === undefined ? null : <span className="bh-card-leading">{leading}</span>}
      {icon === undefined ? null : (
        <span
          className="bh-card-icon"
          role={iconLabel === undefined ? undefined : 'img'}
          aria-label={iconLabel}
          title={iconLabel}
        >
          <ChannelSidebarIcon name={icon} size={16} />
        </span>
      )}
      <span className="bh-card-body">
        {badge === undefined ? (
          <span
            id={titleId}
            className={
              titleClassName === undefined ? 'bh-card-title' : 'bh-card-title ' + titleClassName
            }
          >
            {title}
          </span>
        ) : (
          <span className="bh-card-title-row">
            <span
              id={titleId}
              className={
                titleClassName === undefined ? 'bh-card-title' : 'bh-card-title ' + titleClassName
              }
            >
              {title}
            </span>
            <span className="bh-card-badge">{badge}</span>
          </span>
        )}
        {summary === undefined ? null : <span className="bh-card-summary">{summary}</span>}
        {chips === undefined && chipActions === undefined ? null : (
          <span className="bh-card-chips">
            {chips}
            {chipActions === undefined ? null : (
              <span {...stylex.props(styles.chipActions)}>{chipActions}</span>
            )}
          </span>
        )}
        {meta === undefined ? null : <span className="bh-card-meta">{meta}</span>}
      </span>
    </>
  );
  const className = mainClassName === undefined ? 'bh-card-main' : 'bh-card-main ' + mainClassName;
  return (
    <li
      className="bh-card-row"
      data-settings-row={inGroup ? '' : undefined}
      data-muted={muted === true ? 'true' : undefined}
      data-state={state}
      data-selected={selection?.checked === true ? 'true' : undefined}
      data-anchor={anchor}
      data-flip-key={flipKey}
    >
      <div className={withStyle('bh-card-line', stretched && styles.line)}>
        {selection?.multiple === true ? (
          <label className={className} title={hint}>
            <input
              className="bh-card-checkbox"
              type="checkbox"
              checked={selection.checked}
              disabled={disabled}
              onChange={onClick}
            />
            {body}
          </label>
        ) : onClick === undefined ? (
          <div className={className} title={hint}>
            {body}
          </div>
        ) : (
          <>
            <button
              type="button"
              className={withStyle(className, stretched && styles.stretch)}
              aria-labelledby={stretched ? titleId : undefined}
              title={hint}
              disabled={disabled}
              aria-pressed={selection?.checked}
              aria-haspopup={dialog === true ? 'dialog' : undefined}
              aria-expanded={expanded}
              aria-controls={controls}
              onClick={onClick}
              onPointerEnter={
                onIntent === undefined
                  ? undefined
                  : (event) => {
                      if (event.pointerType !== 'touch') onIntent();
                    }
              }
              onFocus={onIntent}
            >
              {stretched ? null : body}
            </button>
            {stretched ? (
              <div className={withStyle(className, styles.stretched)}>{body}</div>
            ) : null}
          </>
        )}
        {trailing === undefined ? null : (
          <span
            className={withStyle('bh-card-trailing', stretched && styles.above)}
            data-card-trailing={trailingAlign}
          >
            {trailing}
          </span>
        )}
      </div>
      {detail === undefined ? null : (
        <div id={controls} className="bh-card-detail">
          {detail}
        </div>
      )}
    </li>
  );
}
