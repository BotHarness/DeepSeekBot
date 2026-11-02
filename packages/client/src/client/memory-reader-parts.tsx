import type { ReactElement, ReactNode } from 'react';
import {
  IconChevronDownOutlineRegular,
  IconChevronLeftOutlineRegular,
  IconRefreshOutlineRegular,
  IconWrapLinesOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { Tooltip } from './ds/tooltip.js';
import type { BotHarnessTranslate } from './locale.js';
import { parseMemoryDiff } from './memory-diff-model.js';

export function MemoryViewIconButton({
  action,
  onClick,
  t,
}: {
  action: 'backToChat' | 'refresh';
  onClick: () => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const label = t(`memory.${action}`);
  return (
    <Tooltip label={label} side="bottom" delayMs={500}>
      <button
        type="button"
        className="bh-memory-view-icon-button"
        aria-label={label}
        onClick={onClick}
      >
        {action === 'backToChat' ? (
          <IconChevronLeftOutlineRegular size={16} />
        ) : (
          <IconRefreshOutlineRegular size={16} />
        )}
      </button>
    </Tooltip>
  );
}

export function MemoryDiffWrapButton({
  wrap,
  onToggle,
  t,
}: {
  wrap: boolean;
  onToggle: () => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const label = t('memory.autoWrap');
  return (
    <Tooltip label={label} side="bottom" delayMs={500}>
      <button
        type="button"
        className="bh-memory-view-icon-button bh-memory-diff-wrap-button"
        aria-label={label}
        aria-pressed={wrap}
        onClick={onToggle}
      >
        <IconWrapLinesOutlineRegular size={16} />
      </button>
    </Tooltip>
  );
}

export function MemoryDiffFile({
  path,
  status,
  badge,
  diff,
  label,
  binary = false,
  preview,
  binaryLabel,
  emptyLabel,
  oldLineLabel,
  newLineLabel,
  action,
  wrap = true,
}: {
  path: string;
  status: string;
  badge?: string;
  diff: string;
  label: string;
  binary?: boolean;
  preview?: ReactNode;
  binaryLabel: string;
  emptyLabel: string;
  oldLineLabel: string;
  newLineLabel: string;
  action?: ReactNode;
  wrap?: boolean;
}): ReactElement {
  const model = parseMemoryDiff(diff);
  const added = model.lines.filter((line) => line.kind === 'add').length;
  const removed = model.lines.filter((line) => line.kind === 'remove').length;
  return (
    <details className="bh-memory-diff-file" open>
      <summary className="bh-memory-diff-file-header">
        <IconChevronDownOutlineRegular size={16} />
        <strong className="bh-memory-diff-file-name" title={path}>
          {path}
        </strong>
        <span className="bh-memory-change-badge" data-status={status}>
          {badge ?? status}
        </span>
        {added > 0 || removed > 0 ? (
          <span className="bh-memory-diff-stat">
            <span className="bh-memory-diff-stat-add">+{added}</span>
            <span className="bh-memory-diff-stat-remove">-{removed}</span>
          </span>
        ) : null}
        {action === undefined ? null : <span className="bh-memory-diff-file-action">{action}</span>}
      </summary>
      {preview !== undefined ? (
        preview
      ) : binary || model.binary ? (
        <div className="bh-memory-diff-empty">{binaryLabel}</div>
      ) : model.lines.length === 0 ? (
        <div className="bh-memory-diff-empty">{emptyLabel}</div>
      ) : (
        <div className="bh-memory-diff-scroll">
          <table className="bh-memory-diff-table" aria-label={label} data-wrap={wrap}>
            <tbody>
              {model.lines.map((line, index) =>
                line.kind === 'hunk' || line.kind === 'note' ? (
                  <tr key={index} className={`bh-memory-diff-${line.kind}`}>
                    <td colSpan={4}>{line.text}</td>
                  </tr>
                ) : (
                  <tr key={index} className={`bh-memory-diff-${line.kind}`}>
                    <td
                      className="bh-memory-diff-number"
                      aria-label={
                        line.oldLine === undefined ? undefined : `${oldLineLabel} ${line.oldLine}`
                      }
                    >
                      {line.oldLine ?? ''}
                    </td>
                    <td
                      className="bh-memory-diff-number"
                      aria-label={
                        line.newLine === undefined ? undefined : `${newLineLabel} ${line.newLine}`
                      }
                    >
                      {line.newLine ?? ''}
                    </td>
                    <td className="bh-memory-diff-sign" aria-hidden="true">
                      {line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ''}
                    </td>
                    <td className="bh-memory-diff-content">{line.text || ' '}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

export function splitMemoryDiffFiles(diff: string): string[] {
  if (diff === '') return [];
  return diff.split(/(?=^diff --git )/m).filter(Boolean);
}
