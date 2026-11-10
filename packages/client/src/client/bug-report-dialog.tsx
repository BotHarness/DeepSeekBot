import { useId, useRef, useState, type DragEvent, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  Button,
  Checkbox,
  IconCheckCircleOutlineRegular,
  IconCloseOutlineRegular,
  IconLinkOutlineRegular,
  IconPaperclipOutlineRegular,
  IconShieldOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';

import {
  BUG_REPORT_HOURS,
  BUG_REPORT_MAX_BYTES,
  addReportFiles,
  clientDescription,
  formatBytes,
  pastedName,
  reportBytes,
  submitBugReport,
  type BugReportFile,
  type BugReportHours,
  type BugReportReceipt,
} from './bug-report.js';
import { clientLog, logClient } from './diagnostic-log.js';
import { FieldStack, TextAreaField, TextField } from './ds/field.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { Select } from './ds/select.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

const styles = stylex.create({
  section: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  label: { color: color.fg, fontWeight: text.strong },
  drop: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: space.x2,
    paddingBlock: space.x5,
    paddingInline: space.x4,
    borderWidth: border.hairline,
    borderStyle: 'dashed',
    borderColor: { default: color.borderStrong, ':hover': color.accent },
    borderRadius: radius.md,
    backgroundColor: color.well,
    color: color.muted,
    textAlign: 'center',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    outlineOffset: '2px',
  },
  dropOver: { borderColor: color.accent, backgroundColor: color.accentTint, color: color.fg },
  dropTitle: { color: color.fg, fontWeight: text.strong },
  meta: { color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
  files: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: space.x3,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  file: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minWidth: 0,
    padding: space.x2,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.sm,
  },
  thumb: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: '36px',
    height: '36px',
    borderRadius: radius.xs,
    backgroundColor: color.surface,
    backgroundPosition: 'center',
    backgroundSize: 'cover',
    color: color.muted,
    fontSize: text.metaSize,
    fontWeight: text.strong,
  },
  fileMeta: { display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0 },
  fileName: {
    overflow: 'hidden',
    color: color.fg,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  remove: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: '24px',
    height: '24px',
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.xs,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.muted,
    cursor: 'pointer',
  },
  meter: { display: 'flex', flexDirection: 'column', gap: space.x2 },
  bar: {
    height: '4px',
    overflow: 'hidden',
    borderRadius: radius.xs,
    backgroundColor: color.surface,
  },
  fill: { height: '100%', borderRadius: radius.xs, backgroundColor: color.accent },
  fillOver: { backgroundColor: color.danger },
  meterRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: space.x3,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontVariantNumeric: 'tabular-nums',
  },
  error: { color: color.danger, fontSize: text.metaSize, lineHeight: text.metaLine },
  logs: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    paddingBlock: space.x4,
    paddingInline: space.x4,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  logRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.x3 },
  privacy: {
    display: 'flex',
    gap: space.x2,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  privacyIcon: { display: 'inline-flex', flexShrink: 0, marginTop: space.x1 },
  done: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    paddingBlock: space.x4,
    paddingInline: space.x4,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  doneIcon: { display: 'inline-flex', color: color.success },
  mono: {
    fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)',
    fontSize: text.metaSize,
    overflowWrap: 'anywhere',
  },
  steps: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    margin: 0,
    paddingInlineStart: space.x6,
  },
  link: {
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.x2,
    color: color.accentText,
    fontWeight: text.strong,
    textDecoration: { default: 'none', ':hover': 'underline' },
  },
  hiddenInput: { display: 'none' },
  status: { color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
});

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function previewOf(file: File): string | undefined {
  try {
    return URL.createObjectURL(file);
  } catch {
    return undefined;
  }
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? 'FILE' : name.slice(dot + 1, dot + 5).toUpperCase();
}

export function BugReportDialog({
  onClose,
  t,
}: {
  onClose(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const id = useId();
  const picker = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [includeLogs, setIncludeLogs] = useState(true);
  const [hours, setHours] = useState<BugReportHours>('24');
  const [files, setFiles] = useState<readonly BugReportFile[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [receipt, setReceipt] = useState<BugReportReceipt>();
  const filesRef = useRef(files);

  const add = (incoming: readonly File[], pasted = false) => {
    if (incoming.length === 0) return;
    const named = pasted
      ? incoming.map((file) => new File([file], pastedName(file), { type: file.type }))
      : incoming;
    const next = addReportFiles(filesRef.current, named, previewOf);
    filesRef.current = next.files;
    setFiles(next.files);
    setNotice(next.skipped > 0 ? t('bugReport.tooManyFiles') : undefined);
    logClient('action', 'bug-report-attach', { count: named.length, pasted });
  };

  const mount = useMountedResource<HTMLDivElement>(() => {
    const onPaste = (event: ClipboardEvent) => {
      const pasted = [...(event.clipboardData?.files ?? [])];
      if (pasted.length === 0) return;
      event.preventDefault();
      add(pasted, true);
    };
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('paste', onPaste);
      for (const entry of filesRef.current)
        if (entry.preview !== undefined) URL.revokeObjectURL(entry.preview);
    };
  }, []);

  const remove = (target: BugReportFile) => {
    if (target.preview !== undefined) URL.revokeObjectURL(target.preview);
    const next = filesRef.current.filter((entry) => entry !== target);
    filesRef.current = next;
    setFiles(next);
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setOver(false);
    add([...event.dataTransfer.files]);
  };
  const onDrag = (event: DragEvent<HTMLElement>) => {
    if (![...event.dataTransfer.types].includes('Files')) return;
    event.preventDefault();
    setOver(true);
  };

  const bytes = reportBytes(files);
  const tooLarge = bytes > BUG_REPORT_MAX_BYTES;
  const empty = title.trim() === '' && description.trim() === '';

  const backToForm = () => {
    const next = filesRef.current.map((entry): BugReportFile => {
      if (entry.preview === undefined) return entry;
      const preview = previewOf(entry.file);
      return preview === undefined ? { id: entry.id, file: entry.file } : { ...entry, preview };
    });
    filesRef.current = next;
    setFiles(next);
    setReceipt(undefined);
  };

  const submit = async (github: boolean) => {
    setBusy(true);
    setNotice(undefined);
    try {
      await clientLog()?.flush();
      logClient('action', github ? 'bug-report-github' : 'bug-report-download', {
        attachments: files.length,
        hours: includeLogs ? Number(hours) : 0,
      });
      await clientLog()?.flush();
      const result = await submitBugReport(
        { title, description, includeLogs, hours, files },
        clientDescription(globalThis.navigator),
      );
      saveBlob(result.blob, result.receipt.fileName);
      setReceipt(result.receipt);
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : 'operation-failed';
      setNotice(
        code === 'report-too-large'
          ? t('bugReport.tooLarge')
          : code === 'persistence-unavailable'
            ? t('bugReport.logsUnavailable')
            : t('bugReport.failed'),
      );
    } finally {
      setBusy(false);
    }
  };

  if (receipt !== undefined)
    return (
      <PanelDialog
        title={t('bugReport.title')}
        size="medium"
        closeLabel={t('diagnostics.close')}
        onClose={onClose}
        data={{ 'data-bug-report': 'done' }}
        secondary={
          <Button variant="ghost" onClick={backToForm}>
            {t('bugReport.back')}
          </Button>
        }
        actions={
          <Button variant="primary" onClick={onClose}>
            {t('bugReport.done')}
          </Button>
        }
      >
        <div {...stylex.props(styles.done)}>
          <span {...stylex.props(styles.doneIcon)}>
            <IconCheckCircleOutlineRegular size={20} />
          </span>
          <span>
            <span {...stylex.props(styles.label)}>{t('bugReport.saved')}</span>
            <br />
            <span {...stylex.props(styles.mono)}>
              {receipt.fileName} · {formatBytes(receipt.bytes)}
            </span>
          </span>
        </div>
        <ol {...stylex.props(styles.steps)}>
          <li>{t('bugReport.step.open')}</li>
          <li>{t('bugReport.step.attach', { name: receipt.fileName })}</li>
          <li>{t('bugReport.step.submit')}</li>
        </ol>
        {receipt.issueUrl === '' ? null : (
          <a
            href={receipt.issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-bug-report-issue=""
            {...stylex.props(styles.link)}
          >
            <IconLinkOutlineRegular size={16} />
            {t('bugReport.openIssue')}
          </a>
        )}
      </PanelDialog>
    );

  return (
    <PanelDialog
      title={t('bugReport.title')}
      description={t('bugReport.intro')}
      size="medium"
      scroll
      closeLabel={t('diagnostics.close')}
      onClose={onClose}
      data={{ 'data-bug-report': 'form' }}
      secondary={
        <span role="status" {...stylex.props(styles.status)}>
          {notice ?? ''}
        </span>
      }
      actions={
        <>
          <Button
            variant="outline"
            onClick={() => void submit(false)}
            disabled={busy || empty || tooLarge}
          >
            {t('bugReport.download')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit(true)}
            disabled={busy || empty || tooLarge}
          >
            {t('bugReport.github')}
          </Button>
        </>
      }
    >
      <div ref={mount} {...stylex.props(styles.section)}>
        <FieldStack>
          <TextField
            label={t('bugReport.field.title')}
            value={title}
            onChange={setTitle}
            initialFocus
            maxLength={200}
            placeholder={t('bugReport.field.titlePlaceholder')}
          />
          <TextAreaField
            label={t('bugReport.field.description')}
            value={description}
            onChange={setDescription}
            maxLength={8000}
            rows={4}
            placeholder={t('bugReport.field.descriptionPlaceholder')}
          />
        </FieldStack>
      </div>
      <div {...stylex.props(styles.section)}>
        <span id={`${id}-files`} {...stylex.props(styles.label)}>
          {t('bugReport.attachments')}
        </span>
        <button
          type="button"
          aria-describedby={`${id}-files-hint`}
          data-bug-report-drop={over ? 'over' : ''}
          onClick={() => picker.current?.click()}
          onDragEnter={onDrag}
          onDragOver={onDrag}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          {...stylex.props(styles.drop, over && styles.dropOver)}
        >
          <IconPaperclipOutlineRegular size={20} />
          <span {...stylex.props(styles.dropTitle)}>{t('bugReport.drop')}</span>
          <span id={`${id}-files-hint`} {...stylex.props(styles.meta)}>
            {t('bugReport.dropHint')}
          </span>
        </button>
        <input
          ref={picker}
          type="file"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          data-bug-report-picker=""
          onChange={(event) => {
            add([...(event.currentTarget.files ?? [])]);
            event.currentTarget.value = '';
          }}
          {...stylex.props(styles.hiddenInput)}
        />
        {files.length === 0 ? null : (
          <ul aria-labelledby={`${id}-files`} {...stylex.props(styles.files)}>
            {files.map((entry) => (
              <li
                key={entry.id}
                data-bug-report-file={entry.file.name}
                {...stylex.props(styles.file)}
              >
                <span
                  {...stylex.props(styles.thumb)}
                  style={
                    entry.preview === undefined
                      ? undefined
                      : { backgroundImage: `url("${entry.preview}")` }
                  }
                >
                  {entry.preview === undefined ? extensionOf(entry.file.name) : null}
                </span>
                <span {...stylex.props(styles.fileMeta)}>
                  <span title={entry.file.name} {...stylex.props(styles.fileName)}>
                    {entry.file.name}
                  </span>
                  <span {...stylex.props(styles.meta)}>{formatBytes(entry.file.size)}</span>
                </span>
                <button
                  type="button"
                  aria-label={t('bugReport.remove', { name: entry.file.name })}
                  onClick={() => remove(entry)}
                  {...stylex.props(styles.remove)}
                >
                  <IconCloseOutlineRegular size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div {...stylex.props(styles.meter)}>
          <div {...stylex.props(styles.bar)}>
            <div
              {...stylex.props(styles.fill, tooLarge && styles.fillOver)}
              style={{ width: `${Math.min(100, (bytes / BUG_REPORT_MAX_BYTES) * 100)}%` }}
            />
          </div>
          <div {...stylex.props(styles.meterRow)}>
            <span>{t('bugReport.files', { count: String(files.length) })}</span>
            <span data-bug-report-total="">{(bytes / (1024 * 1024)).toFixed(1)} / 25 MB</span>
          </div>
          {tooLarge ? (
            <span role="alert" {...stylex.props(styles.error)}>
              {t('bugReport.tooLarge')}
            </span>
          ) : null}
        </div>
      </div>
      <div {...stylex.props(styles.logs)}>
        <span {...stylex.props(styles.label)}>{t('bugReport.include')}</span>
        <div {...stylex.props(styles.logRow)}>
          <Checkbox
            checked={includeLogs}
            onChange={setIncludeLogs}
            label={t('bugReport.includeLogs')}
          />
          <Select
            label={t('bugReport.hours')}
            value={hours}
            disabled={!includeLogs}
            options={BUG_REPORT_HOURS.map((value) => ({
              value,
              label: t(`bugReport.hours.${value}`),
            }))}
            onChange={setHours}
          />
        </div>
        <span {...stylex.props(styles.meta)}>{t('bugReport.environment')}</span>
        <span {...stylex.props(styles.privacy)}>
          <span {...stylex.props(styles.privacyIcon)}>
            <IconShieldOutlineRegular size={14} />
          </span>
          {t('bugReport.privacy')}
        </span>
      </div>
    </PanelDialog>
  );
}
