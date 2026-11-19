import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  approvalFileChange,
  approvalShellCommand,
} from '@botharness/host-client/shared/approval-diff';
import type { BotHarnessTranslate } from './locale.js';
import { Button } from './ds/button.js';
import { hooked } from './ds/hooked.js';
import { requestCardStyles as card } from './ds/request-card.js';
import { ink, space, status } from './ds/tobs.stylex.js';

const styles = stylex.create({
  noMargin: { margin: 0 },
  input: { maxHeight: 'min(420px, 60vh)', overflow: 'auto' },
  compact: { maxHeight: '160px' },
  folded: { maxHeight: 'none', overflow: 'hidden' },
  toggle: { justifySelf: 'start' },
  file: { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: space.x2 },
  diff: { paddingInline: 0 },
  diffLine: { display: 'block', paddingInline: space.x3 },
  diffMark: { display: 'inline-block', width: '1.5ch', color: ink.primary, userSelect: 'none' },
  added: { backgroundColor: status.successTint, color: status.successInk },
  removed: { backgroundColor: status.dangerTint, color: status.dangerInk },
  change: { textDecoration: 'none' },
});

export const APPROVAL_INPUT_PREVIEW_LINES = 12;
export const APPROVAL_INPUT_PREVIEW_CHARS = 480;

function preview(value: string): string {
  const lines = value.split('\n').slice(0, APPROVAL_INPUT_PREVIEW_LINES).join('\n');
  return lines.length > APPROVAL_INPUT_PREVIEW_CHARS
    ? lines.slice(0, APPROVAL_INPUT_PREVIEW_CHARS) + '…'
    : lines;
}

export function ApprovalInput({
  toolName,
  input,
  t,
  caption = true,
  compact = false,
}: {
  toolName: string;
  input: string;
  t: BotHarnessTranslate;
  caption?: boolean;
  compact?: boolean;
}): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const fileChange = approvalFileChange(toolName, input);
  const shell = fileChange === undefined ? approvalShellCommand(toolName, input) : undefined;
  const shown = shell?.command ?? input;
  const lineCount = fileChange?.lines.length ?? shown.split('\n').length;
  const foldable =
    lineCount > APPROVAL_INPUT_PREVIEW_LINES ||
    (fileChange === undefined && shown.length > APPROVAL_INPUT_PREVIEW_CHARS);
  const folded = foldable && !expanded;
  const inputStyles = [
    card.well,
    card.preview,
    styles.noMargin,
    styles.input,
    compact && styles.compact,
    folded && styles.folded,
  ];
  const toggle = foldable ? (
    <Button
      type="button"
      size="sm"
      {...hooked('bh-tool-approval-fold', styles.toggle)}
      aria-expanded={expanded}
      onClick={() => setExpanded((value) => !value)}
    >
      {t(expanded ? 'approval.collapseInput' : 'approval.expandInput')}
    </Button>
  ) : null;
  if (shell !== undefined)
    return (
      <figure {...hooked('bh-tool-approval-shell', card.group, styles.noMargin)}>
        {shell.description === undefined || !caption ? null : (
          <figcaption {...stylex.props(card.caption)}>{shell.description}</figcaption>
        )}
        <pre
          {...stylex.props(...inputStyles)}
          data-folded={folded || undefined}
          aria-label={t('approval.commandLabel')}
        >
          <span {...stylex.props(styles.diffMark)} aria-hidden="true">
            ${' '}
          </span>
          {folded ? preview(shell.command) : shell.command}
        </pre>
        {toggle}
      </figure>
    );
  if (fileChange === undefined)
    return (
      <div {...stylex.props(card.group)}>
        <pre {...stylex.props(...inputStyles)} data-folded={folded || undefined}>
          {folded ? preview(input) : input}
        </pre>
        {toggle}
      </div>
    );
  const lines = folded ? fileChange.lines.slice(0, APPROVAL_INPUT_PREVIEW_LINES) : fileChange.lines;
  return (
    <figure {...hooked('bh-tool-approval-diff', card.group, styles.noMargin)}>
      <figcaption {...stylex.props(card.caption, styles.file)}>
        <code>{fileChange.path}</code>
        <span {...stylex.props(card.added)} data-kind="add">
          +{fileChange.added}
        </span>
        <span {...stylex.props(card.removed)} data-kind="remove">
          −{fileChange.removed}
        </span>
      </figcaption>
      <pre
        {...stylex.props(...inputStyles, styles.diff)}
        data-folded={folded || undefined}
        aria-label={t('approval.diffLabel', { path: fileChange.path })}
      >
        {lines.map((line, index) => (
          <span
            key={index}
            {...hooked(
              'bh-tool-approval-diff-line',
              styles.diffLine,
              line.kind === 'add' && styles.added,
              line.kind === 'remove' && styles.removed,
            )}
            data-kind={line.kind}
          >
            <span {...stylex.props(styles.diffMark)} aria-hidden="true">
              {line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}
            </span>
            {line.kind === 'add' ? (
              <ins {...stylex.props(styles.change)}>{line.text}</ins>
            ) : line.kind === 'remove' ? (
              <del {...stylex.props(styles.change)}>{line.text}</del>
            ) : (
              line.text
            )}
            {'\n'}
          </span>
        ))}
      </pre>
      {toggle}
    </figure>
  );
}
