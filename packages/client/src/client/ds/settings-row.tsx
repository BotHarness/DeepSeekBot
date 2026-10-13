import { useId, type ReactElement, type ReactNode, type Ref } from 'react';
import * as stylex from '@stylexjs/stylex';

import { color, space, text } from './tokens.stylex.js';

const NARROW = '@media (max-width: 648px)';

const styles = stylex.create({
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
  sectionHead: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    paddingBottom: space.x2,
  },
  sectionTitle: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
  },
  row: {
    display: 'flex',
    alignItems: { default: 'center', [NARROW]: 'stretch' },
    flexDirection: { default: 'row', [NARROW]: 'column' },
    gap: { default: space.x4, [NARROW]: space.x3 },
    minWidth: 0,
    paddingBlock: space.x4,
    borderBottomWidth: '0.5px',
    borderBottomStyle: 'solid',
    borderBottomColor: { default: color.border, ':last-child': 'transparent' },
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
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
    overflowWrap: 'anywhere',
  },
  description: {
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
  control: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: { default: 'flex-end', [NARROW]: 'flex-start' },
    gap: space.x3,
    flexShrink: 0,
    minWidth: 0,
    maxWidth: { default: '60%', [NARROW]: '100%' },
  },
  value: {
    color: color.muted,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
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
    <div ref={rootRef} {...stylex.props(styles.rows)}>
      {children}
    </div>
  );
}

export interface SettingsSectionProps {
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly children: ReactNode;
}

export function SettingsSection({
  title,
  description,
  children,
}: SettingsSectionProps): ReactElement {
  const id = useId();
  return (
    <section
      aria-labelledby={title === undefined ? undefined : `${id}-title`}
      {...stylex.props(styles.section)}
    >
      {title === undefined ? null : (
        <div {...stylex.props(styles.sectionHead)}>
          <h3 id={`${id}-title`} {...stylex.props(styles.sectionTitle)}>
            {title}
          </h3>
          {description === undefined ? null : (
            <div {...stylex.props(styles.description)}>{description}</div>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

export interface SettingsRowProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly control?: ReactNode;
  readonly children?: ReactNode;
  readonly rootRef?: Ref<HTMLDivElement> | undefined;
  readonly data?: Readonly<Record<`data-${string}`, string | undefined>>;
}

export function SettingsRow({
  title,
  description,
  control,
  children,
  rootRef,
  data,
}: SettingsRowProps): ReactElement {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  return (
    <div
      ref={rootRef}
      role="group"
      aria-labelledby={titleId}
      aria-describedby={description === undefined ? undefined : descriptionId}
      {...data}
      {...stylex.props(styles.row)}
    >
      <div {...stylex.props(styles.text)}>
        <div id={titleId} {...stylex.props(styles.title)}>
          {title}
        </div>
        {description === undefined ? null : (
          <div id={descriptionId} {...stylex.props(styles.description)}>
            {description}
          </div>
        )}
        {children}
      </div>
      {control === undefined ? null : <div {...stylex.props(styles.control)}>{control}</div>}
    </div>
  );
}

export function SettingsValue({ children }: { readonly children: ReactNode }): ReactElement {
  return <span {...stylex.props(styles.value)}>{children}</span>;
}
