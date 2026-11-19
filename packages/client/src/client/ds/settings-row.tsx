import {
  createContext,
  useContext,
  useId,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import * as stylex from '@stylexjs/stylex';

import { edge, ink, space, style, type as text } from './tobs.stylex.js';
import { InfoTip } from './info-tip.js';
import { surfaceStyles } from './surface.js';

const NARROW = '@media (max-width: 648px)';
const COMPACT = '@container bh-settings (max-width: 480px)';

export const SettingsGroupContext = createContext(false);

const styles = stylex.create({
  titleLine: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    minWidth: 0,
  },
  rows: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    paddingTop: { default: space.x5, ':first-child': 0 },
  },
  portaled: { paddingTop: space.x5 },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: style.listGap,
    minWidth: 0,
    paddingInline: {
      default: style.listGroupPaddingInline,
      ':not(:empty):not(:has(> :is([data-settings-row], [data-settings-part], section)))': `calc(${style.listGroupPaddingInline} + ${style.listItemPadding})`,
      ':has(> section)': 0,
    },
    paddingBlock: {
      default: style.listGroupPaddingBlock,
      ':not(:empty):not(:has(> :is([data-settings-row], [data-settings-part], section)))': `calc(${style.listGroupPaddingBlock} + ${style.listItemPaddingBlock})`,
      ':has(> section)': 0,
    },
    borderRadius: { default: style.listGroupRadius, ':has(> section)': 0 },
    overflow: 'clip',
    backgroundColor: {
      default: style.listGroupFill,
      ':has(> section)': 'transparent',
    },
    boxShadow: {
      default: `0 0 0 0.5px ${style.listGroupEdge}`,
      ':has(> section)': 'none',
    },
  },
  sectionHead: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    paddingBottom: space.x3,
    paddingInline: `calc(${style.listGroupPaddingInline} + ${style.listItemPadding})`,
  },
  sectionTitleLine: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x3,
    minWidth: 0,
  },
  sectionTitle: {
    margin: 0,
    color: style.textSectionTitle,
    fontSize: text.captionSize,
    lineHeight: text.captionLine,
    fontWeight: text.labelWeight,
  },
  row: {
    display: 'flex',
    alignItems: {
      default: 'center',
      [NARROW]: 'stretch',
      [COMPACT]: 'stretch',
    },
    flexDirection: { default: 'row', [NARROW]: 'column', [COMPACT]: 'column' },
    gap: { default: space.x4, [NARROW]: space.x3, [COMPACT]: space.x3 },
    minWidth: 0,
    minHeight: style.rowList,
    boxSizing: 'border-box',
    paddingBlock: style.listItemPaddingBlock,
    paddingInline: style.listItemPadding,
    borderRadius: style.listItemRadius,
    backgroundColor: style.listItemFill,
    borderBottomWidth: edge.hairline,
    borderBottomStyle: 'solid',
    borderBottomColor: {
      default: 'transparent',
      ':has(~ :is([data-settings-row], [data-settings-part]))': style.listSeparator,
      [stylex.when.ancestor(':has(~ :is([data-settings-row], [data-settings-part]))')]:
        style.listSeparator,
    },
  },
  lone: { borderRadius: style.listGroupRadius },
  label: {
    display: 'flex',
    alignItems: 'flex-start',
    flexGrow: 1,
    minWidth: 0,
    gap: space.x3,
  },
  icon: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: style.iconSlot,
    height: style.iconSlot,
    color: ink.secondary,
  },
  text: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  title: {
    color: ink.primary,
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    fontWeight: text.bodyWeight,
    overflowWrap: 'anywhere',
  },
  description: {
    color: ink.tertiary,
    fontSize: text.captionSize,
    lineHeight: text.captionLine,
    overflowWrap: 'anywhere',
  },
  control: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: {
      default: 'flex-end',
      [NARROW]: 'flex-start',
      [COMPACT]: 'flex-start',
    },
    gap: space.x3,
    flexShrink: 0,
    minWidth: 0,
    maxWidth: { default: '60%', [NARROW]: '100%', [COMPACT]: '100%' },
  },
  part: { display: 'contents' },
  value: {
    color: ink.secondary,
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    textAlign: 'end',
    overflowWrap: 'anywhere',
  },
});

export function SettingsRows({
  children,
  rootRef,
}: {
  readonly children: ReactNode;
  readonly rootRef?: Ref<HTMLDivElement> | undefined;
}): ReactElement {
  return (
    <div
      ref={rootRef}
      data-settings-group=""
      {...stylex.props(styles.rows, styles.group, surfaceStyles.card)}
    >
      <SettingsGroupContext.Provider value>{children}</SettingsGroupContext.Provider>
    </div>
  );
}

export interface SettingsSectionProps {
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly portaled?: boolean;
  readonly rootRef?: Ref<HTMLElement> | undefined;
  readonly data?: Readonly<Record<`data-${string}`, string | undefined>>;
  readonly children: ReactNode;
}

export function SettingsSection({
  title,
  description,
  action,
  portaled = false,
  rootRef,
  data,
  children,
}: SettingsSectionProps): ReactElement {
  const id = useId();
  return (
    <section
      ref={rootRef}
      {...data}
      aria-labelledby={title === undefined ? undefined : `${id}-title`}
      {...stylex.props(styles.section, portaled && styles.portaled)}
    >
      {title === undefined ? null : (
        <div {...stylex.props(styles.sectionHead)}>
          <div {...stylex.props(styles.sectionTitleLine)}>
            <h3 id={`${id}-title`} {...stylex.props(styles.sectionTitle)}>
              {title}
            </h3>
            {action}
          </div>
          {description === undefined ? null : (
            <div {...stylex.props(styles.description)}>{description}</div>
          )}
        </div>
      )}
      <div data-settings-group="" {...stylex.props(styles.group, surfaceStyles.card)}>
        <SettingsGroupContext.Provider value>{children}</SettingsGroupContext.Provider>
      </div>
    </section>
  );
}

export interface SettingsRowProps {
  readonly title: ReactNode;
  readonly icon?: ReactNode;
  readonly description?: ReactNode;
  readonly info?: { readonly label: string; readonly text: string } | undefined;
  readonly control?: ReactNode;
  readonly children?: ReactNode;
  readonly rootRef?: Ref<HTMLDivElement> | undefined;
  readonly data?: Readonly<Record<`data-${string}`, string | undefined>>;
}

export function SettingsRow({
  title,
  icon,
  description,
  info,
  control,
  children,
  rootRef,
  data,
}: SettingsRowProps): ReactElement {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const grouped = useContext(SettingsGroupContext);
  return (
    <div
      ref={rootRef}
      role="group"
      aria-labelledby={titleId}
      aria-describedby={description === undefined ? undefined : descriptionId}
      data-settings-row=""
      {...data}
      {...stylex.props(styles.row, !grouped && styles.lone)}
    >
      <div {...stylex.props(styles.label)}>
        {icon === undefined ? null : (
          <span aria-hidden="true" {...stylex.props(styles.icon)}>
            {icon}
          </span>
        )}
        <div {...stylex.props(styles.text)}>
          <div {...stylex.props(styles.titleLine)}>
            <div id={titleId} {...stylex.props(styles.title)}>
              {title}
            </div>
            {info === undefined ? null : <InfoTip label={info.label} text={info.text} />}
          </div>
          {description === undefined ? null : (
            <div id={descriptionId} {...stylex.props(styles.description)}>
              {description}
            </div>
          )}
          {children}
        </div>
      </div>
      {control === undefined ? null : <div {...stylex.props(styles.control)}>{control}</div>}
    </div>
  );
}

export function SettingsValue({ children }: { readonly children: ReactNode }): ReactElement {
  return <span {...stylex.props(styles.value)}>{children}</span>;
}

export function SettingsGroupPart({
  children,
  rootRef,
  busy,
  role,
  label,
  data,
}: {
  readonly children: ReactNode;
  readonly rootRef?: Ref<HTMLDivElement> | undefined;
  readonly busy?: boolean;
  readonly role?: 'list' | 'listitem';
  readonly label?: string;
  readonly data?: Readonly<Record<`data-${string}`, string | undefined>>;
}): ReactElement {
  return (
    <div
      ref={rootRef}
      role={role}
      aria-label={label}
      aria-busy={busy}
      data-settings-part=""
      {...data}
      {...stylex.props(stylex.defaultMarker(), styles.part)}
    >
      {children}
    </div>
  );
}

export const settingsRowStyles = stylex.create({
  block: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: space.x3,
  },
  title: {
    color: ink.primary,
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    fontWeight: text.bodyWeight,
  },
  description: {
    color: ink.tertiary,
    fontSize: text.captionSize,
    lineHeight: text.captionLine,
  },
});

export const settingsRowBase = styles.row;
