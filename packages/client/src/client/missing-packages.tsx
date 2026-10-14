import { useState, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { Note } from './ds/note.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';

const styles = stylex.create({
  root: {
    display: 'grid',
    gap: space.x3,
    justifyItems: 'start',
    width: '100%',
  },
  progress: {
    display: 'grid',
    gap: space.x1,
    width: '100%',
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  bar: {
    width: '100%',
    height: '6px',
    accentColor: color.accent,
  },
  command: {
    margin: 0,
    width: '100%',
    boxSizing: 'border-box',
    paddingBlock: space.x2,
    paddingInline: space.x2,
    borderRadius: radius.sm,
    backgroundColor: color.hover,
    color: color.fg,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  actions: {
    display: 'flex',
    gap: space.x2,
    flexWrap: 'wrap',
  },
});

export type MissingPackagesAccess = 'root' | 'sudo' | 'none';

export interface MissingPackagesLabels {
  readonly missing: string;
  readonly manual: string;
  readonly install: string;
  readonly copy: string;
  readonly copied: string;
}

export function formatProgressMiB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProgressLine({
  percent,
  label,
}: {
  readonly percent: number;
  readonly label: string;
}): ReactElement {
  const value = Math.max(0, Math.min(100, percent));
  return (
    <div role="status" {...stylex.props(styles.progress)}>
      <progress {...stylex.props(styles.bar)} max={100} value={value} />
      <span>{label}</span>
    </div>
  );
}

export function MissingPackages({
  command,
  access,
  installing,
  busy = false,
  onInstall,
  labels,
  children,
}: {
  readonly command: string;
  readonly access: MissingPackagesAccess;
  readonly installing?: { readonly percent: number; readonly label: string } | undefined;
  readonly busy?: boolean;
  readonly onInstall: () => void;
  readonly labels: MissingPackagesLabels;
  readonly children?: ReactNode;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    void navigator.clipboard?.writeText(command).then(() => setCopied(true));
  };
  return (
    <div {...stylex.props(styles.root)}>
      {installing === undefined ? (
        <Note tone="warning">{labels.missing}</Note>
      ) : (
        <ProgressLine percent={installing.percent} label={installing.label} />
      )}
      {access === 'none' && installing === undefined ? (
        <>
          <Note>{labels.manual}</Note>
          <pre {...stylex.props(styles.command)}>{command}</pre>
        </>
      ) : null}
      <div {...stylex.props(styles.actions)}>
        {access !== 'none' && installing === undefined ? (
          <Button size="sm" variant="primary" disabled={busy} onClick={onInstall}>
            {labels.install}
          </Button>
        ) : null}
        {access === 'none' ? (
          <Button size="sm" variant="outline" onClick={copy}>
            {copied ? labels.copied : labels.copy}
          </Button>
        ) : null}
        {children}
      </div>
    </div>
  );
}
