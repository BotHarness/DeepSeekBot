import { useState, type ReactNode } from 'react';

import * as stylex from '@stylexjs/stylex';

import { WorkRow } from './ds/work-row.js';
import { font } from './ds/tobs.stylex.js';
import { color, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { DiffStat } from './session-tool-detail-view.js';
import { changedFiles, type TranscriptBlock } from './session-transcript-view.js';

const styles = stylex.create({
  files: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    paddingInlineStart: space.x6,
    paddingBottom: space.x2,
  },
  file: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minWidth: 0,
    fontFamily: font.familyMono,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  filePath: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: color.muted,
  },
});

export function ChangedFiles({
  block,
  t,
}: {
  block: Extract<TranscriptBlock, { kind: 'turn' }>;
  t: BotHarnessTranslate;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const files = changedFiles(block.segments);
  if (block.live || files.length === 0) return null;
  const added = files.reduce((sum, file) => sum + file.added, 0);
  const removed = files.reduce((sum, file) => sum + file.removed, 0);
  return (
    <div data-transcript="changes">
      <WorkRow
        icon="files"
        label={t('sessions.detail.changes', { count: files.length })}
        trailing={<DiffStat added={added} removed={removed} />}
        expanded={open}
        onToggle={() => setOpen(!open)}
      />
      {open ? (
        <div {...stylex.props(styles.files)}>
          {files.map((file) => (
            <div key={file.path} data-changed-file={file.path} {...stylex.props(styles.file)}>
              <span title={file.path} {...stylex.props(styles.filePath)}>
                {file.path}
              </span>
              <DiffStat added={file.added} removed={file.removed} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
