import { type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import {
  Button,
  IconCheckOutlineRegular,
  IconCopyOutlineRegular,
  IconFullscreenOutlineRegular,
  MenuSurface,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BugReportFile } from './bug-report.js';
import { CAPTURE_DOCK_ATTRIBUTE, canCopyImage, type CaptureSource } from './bug-report-capture.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';

const styles = stylex.create({
  dock: {
    position: 'fixed',
    zIndex: 1100,
    left: '50%',
    bottom: `calc(${space.x6} + env(safe-area-inset-bottom, 0px))`,
    transform: 'translateX(-50%)',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: space.x3,
    width: 'max-content',
    maxWidth: 'min(720px, calc(100vw - 32px))',
    padding: space.x3,
    backgroundColor: color.modal,
    '--dsw-elevation-stroke-color': color.divider,
    boxShadow: 'var(--dsw-elevation-prominent)',
  },
  hidden: { visibility: 'hidden' },
  bar: { display: 'flex', alignItems: 'center', gap: space.x3, minWidth: 0 },
  copy: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    paddingInline: space.x3,
  },
  count: {
    color: color.fg,
    fontSize: text.bodySize,
    fontWeight: text.strong,
    lineHeight: text.bodyLine,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  hint: {
    display: { default: 'block', '@media (max-width: 560px)': 'none' },
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    whiteSpace: 'nowrap',
  },
  status: { color: color.danger, fontSize: text.metaSize, lineHeight: text.metaLine },
  info: { color: color.success },
  shots: {
    display: 'flex',
    justifyContent: 'flex-start',
    gap: space.x2,
    width: 0,
    minWidth: '100%',
    overflowX: 'auto',
    margin: 0,
    paddingBlock: space.x1,
    paddingInline: space.x1,
    listStyle: 'none',
    scrollbarWidth: 'thin',
  },
  shot: { position: 'relative', flexShrink: 0 },
  thumb: {
    display: 'block',
    width: '96px',
    height: '60px',
    padding: 0,
    overflow: 'hidden',
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: { default: color.border, ':hover': color.accent },
    borderRadius: radius.xs,
    backgroundColor: color.well,
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '1px',
  },
  image: { display: 'block', width: '100%', height: '100%', objectFit: 'cover' },
  copyButton: {
    position: 'absolute',
    right: '2px',
    bottom: '2px',
    display: 'grid',
    placeItems: 'center',
    width: '20px',
    height: '20px',
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.xs,
    backgroundColor: { default: color.modal, ':hover': color.hover },
    color: { default: color.muted, ':hover': color.fg },
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
  },
});

function ShotThumb({ file }: { file: File }): ReactElement {
  const mount = useMountedResource<HTMLImageElement>(
    (image) => {
      const url = URL.createObjectURL(file);
      image.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [file],
  );
  return <img ref={mount} alt="" {...stylex.props(styles.image)} />;
}

export function CaptureDock({
  source,
  shots,
  hidden,
  busy,
  notice,
  t,
  onCapture,
  onEdit,
  onCopy,
  onDone,
}: {
  source: CaptureSource;
  shots: readonly BugReportFile[];
  hidden: boolean;
  busy: boolean;
  notice?: { text: string; tone: 'error' | 'info' } | undefined;
  t: BotHarnessTranslate;
  onCapture(): void;
  onEdit(entry: BugReportFile): void;
  onCopy(entry: BugReportFile): void;
  onDone(): void;
}): ReactElement {
  const focus = useMountedResource<HTMLButtonElement>((button) => {
    button.focus({ preventScroll: true });
  }, []);
  const own = useMountedResource<HTMLDivElement>(() => () => source.stop(), [source]);
  const shotList = (
    <>
      {shots.length === 0 ? null : (
        <ul {...stylex.props(styles.shots)}>
          {shots.map((entry) => (
            <li
              key={entry.id}
              data-bug-report-dock-shot={entry.file.name}
              {...stylex.props(styles.shot)}
            >
              <button
                type="button"
                aria-label={t('bugReport.dock.edit', { name: entry.file.name })}
                title={entry.note ?? entry.file.name}
                disabled={busy}
                onClick={() => onEdit(entry)}
                {...stylex.props(styles.thumb)}
              >
                <ShotThumb file={entry.file} />
              </button>
              {canCopyImage() ? (
                <button
                  type="button"
                  aria-label={t('bugReport.dock.copy', { name: entry.file.name })}
                  title={t('bugReport.dock.copy', { name: entry.file.name })}
                  onClick={() => onCopy(entry)}
                  {...stylex.props(styles.copyButton)}
                >
                  <IconCopyOutlineRegular size={12} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
  return createPortal(
    <MenuSurface
      ref={own}
      role="toolbar"
      aria-label={t('bugReport.dock.label')}
      aria-hidden={hidden || undefined}
      {...{ [CAPTURE_DOCK_ATTRIBUTE]: '' }}
      data-bh-appearance-owned=""
      className={stylex.props(styles.dock, hidden && styles.hidden).className}
    >
      {shotList}
      <div {...stylex.props(styles.bar)}>
        <div {...stylex.props(styles.copy)}>
          <span role="status" data-bug-report-dock-count="" {...stylex.props(styles.count)}>
            {busy
              ? t('bugReport.dock.busy')
              : t('bugReport.dock.count', { count: String(shots.length) })}
          </span>
          {notice === undefined ? (
            <span {...stylex.props(styles.hint)}>{t('bugReport.dock.hint')}</span>
          ) : (
            <span
              role={notice.tone === 'error' ? 'alert' : 'status'}
              {...stylex.props(styles.status, notice.tone === 'info' && styles.info)}
            >
              {notice.text}
            </span>
          )}
        </div>
        <Button
          ref={focus}
          variant="primary"
          icon={<IconFullscreenOutlineRegular size={16} />}
          disabled={busy}
          data-bug-report-dock-capture=""
          onClick={onCapture}
        >
          {t('bugReport.dock.capture')}
        </Button>
        <Button
          variant="outline"
          icon={<IconCheckOutlineRegular size={16} />}
          disabled={busy}
          data-bug-report-dock-done=""
          onClick={onDone}
        >
          {t('bugReport.dock.done')}
        </Button>
      </div>
    </MenuSurface>,
    document.body,
  );
}
