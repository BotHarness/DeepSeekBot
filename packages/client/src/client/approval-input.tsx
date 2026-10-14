import { useState, type ReactElement } from 'react';
import { approvalFileChange, approvalShellCommand } from './approval-diff.js';
import type { BotHarnessTranslate } from './locale.js';

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
}: {
  toolName: string;
  input: string;
  t: BotHarnessTranslate;
  caption?: boolean;
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
  const toggle = foldable ? (
    <button
      type="button"
      className="bh-tool-approval-fold"
      aria-expanded={expanded}
      onClick={() => setExpanded((value) => !value)}
    >
      {t(expanded ? 'approval.collapseInput' : 'approval.expandInput')}
    </button>
  ) : null;
  if (shell !== undefined)
    return (
      <figure className="bh-tool-approval-input-block bh-tool-approval-shell">
        {shell.description === undefined || !caption ? null : (
          <figcaption>{shell.description}</figcaption>
        )}
        <pre
          className="bh-tool-approval-input"
          data-folded={folded || undefined}
          aria-label={t('approval.commandLabel')}
        >
          <span className="bh-tool-approval-diff-mark" aria-hidden="true">
            ${' '}
          </span>
          {folded ? preview(shell.command) : shell.command}
        </pre>
        {toggle}
      </figure>
    );
  if (fileChange === undefined)
    return (
      <div className="bh-tool-approval-input-block">
        <pre className="bh-tool-approval-input" data-folded={folded || undefined}>
          {folded ? preview(input) : input}
        </pre>
        {toggle}
      </div>
    );
  const lines = folded ? fileChange.lines.slice(0, APPROVAL_INPUT_PREVIEW_LINES) : fileChange.lines;
  return (
    <figure className="bh-tool-approval-input-block bh-tool-approval-diff">
      <figcaption>
        <code>{fileChange.path}</code>
        <span className="bh-tool-approval-diff-stat" data-kind="add">
          +{fileChange.added}
        </span>
        <span className="bh-tool-approval-diff-stat" data-kind="remove">
          −{fileChange.removed}
        </span>
      </figcaption>
      <pre
        className="bh-tool-approval-input"
        data-folded={folded || undefined}
        aria-label={t('approval.diffLabel', { path: fileChange.path })}
      >
        {lines.map((line, index) => (
          <span key={index} className="bh-tool-approval-diff-line" data-kind={line.kind}>
            <span className="bh-tool-approval-diff-mark" aria-hidden="true">
              {line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}
            </span>
            {line.kind === 'add' ? (
              <ins>{line.text}</ins>
            ) : line.kind === 'remove' ? (
              <del>{line.text}</del>
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
