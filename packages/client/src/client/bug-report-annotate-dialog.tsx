import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, IconCopyOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

import {
  ANNOTATION_TEXT_CHARS,
  ANNOTATION_TOOLS,
  annotatedName,
  boxNoteAnchor,
  canvasPoint,
  labelSize,
  textAnnotation,
  extendAnnotation,
  finishAnnotation,
  paintAnnotation,
  previewAnnotation,
  startAnnotation,
  strokeWidth,
  type Annotation,
  type AnnotationDraft,
  type AnnotationPoint,
  type AnnotationTool,
} from './bug-report-annotate.js';
import { BUG_REPORT_NOTE_CHARS } from './bug-report.js';
import { canCopyImage, copyImage } from './bug-report-capture.js';
import { ChipButton } from './ds/chip-button.js';
import { TextField } from './ds/field.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { border, color, dialog, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

const styles = stylex.create({
  body: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  tools: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.x2 },
  spacer: { flexGrow: 1 },
  stage: {
    display: 'grid',
    placeItems: 'center',
    minHeight: '160px',
    padding: space.x2,
    borderRadius: radius.md,
    backgroundColor: color.well,
  },
  frame: { position: 'relative', display: 'grid', maxWidth: '100%', minWidth: 0 },
  label: {
    position: 'absolute',
    zIndex: 1,
    boxSizing: 'border-box',
    width: 'min(260px, 60%)',
    paddingBlock: space.x2,
    paddingInline: space.x3,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.danger,
    borderRadius: radius.xs,
    backgroundColor: color.modal,
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    outline: 'none',
    boxShadow: 'var(--dsw-elevation-prominent)',
  },
  canvas: {
    display: 'block',
    maxWidth: '100%',
    maxHeight: dialog.bodyMax,
    color: color.danger,
    cursor: 'crosshair',
    touchAction: 'none',
  },
  hint: { color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
  tool: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    minHeight: '36px',
    paddingBlock: space.x2,
    paddingInline: space.x4,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: { default: color.muted, ':hover': color.fg },
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '-2px',
  },
  toolIcon: { display: 'block', flexShrink: 0 },
  pressed: {
    borderColor: color.accent,
    backgroundColor: { default: color.accentTint, ':hover': color.accentTint },
    color: { default: color.accentText, ':hover': color.accentText },
  },
});

function ToolIcon({ tool }: { tool: AnnotationTool }): ReactElement {
  const shape =
    tool === 'box' ? (
      <rect x="2.5" y="3.5" width="11" height="9" rx="1" fill="none" />
    ) : tool === 'pen' ? (
      <path
        d="M3 13l1-3.5L10.5 3a1.4 1.4 0 0 1 2 0l.5.5a1.4 1.4 0 0 1 0 2L6.5 12 3 13z"
        fill="none"
      />
    ) : tool === 'text' ? (
      <path d="M3.5 4V3h9v1M8 3v10M6 13h4" fill="none" />
    ) : (
      <>
        <rect x="2.5" y="4.5" width="11" height="7" rx="1" fill="currentColor" stroke="none" />
        <path d="M2 14L14 2" fill="none" />
      </>
    );
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...stylex.props(styles.toolIcon)}
    >
      {shape}
    </svg>
  );
}

export function AnnotateDialog({
  file,
  annotations = [],
  note: initialNote = '',
  t,
  doneLabel,
  cancelLabel,
  onCancel,
  onDone,
}: {
  file: File;
  annotations?: readonly Annotation[] | undefined;
  note?: string | undefined;
  t: BotHarnessTranslate;
  doneLabel?: string | undefined;
  cancelLabel?: string | undefined;
  onCancel(): void;
  onDone(next: File, edit: { note: string; annotations: readonly Annotation[] }): void;
}): ReactElement {
  const [tool, setTool] = useState<AnnotationTool>('box');
  const [note, setNote] = useState(initialNote);
  const [count, setCount] = useState(annotations.length);
  const [label, setLabel] = useState<{ at: AnnotationPoint; value: string }>();
  const [copied, setCopied] = useState<'done' | 'failed'>();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const image = useRef<CanvasImageSource | undefined>(undefined);
  const done = useRef<Annotation[]>([...annotations]);
  const draft = useRef<AnnotationDraft | undefined>(undefined);

  const paint = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas === null || canvas === undefined || context === null || context === undefined)
      return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (image.current !== undefined) context.drawImage(image.current, 0, 0);
    const options = {
      stroke: getComputedStyle(canvas).color,
      width: strokeWidth(canvas),
      label: labelSize(canvas),
      canvasWidth: canvas.width,
    };
    const pending = draft.current === undefined ? undefined : previewAnnotation(draft.current);
    for (const annotation of pending === undefined ? done.current : [...done.current, pending])
      paintAnnotation(context, annotation, options);
  };

  const mount = useMountedResource<HTMLCanvasElement>(
    (canvas) => {
      canvasRef.current = canvas;
      const url = URL.createObjectURL(file);
      const element = new Image();
      let live = true;
      element.onload = () => {
        if (!live) return;
        canvas.width = element.naturalWidth;
        canvas.height = element.naturalHeight;
        image.current = element;
        setReady(true);
        paint();
      };
      element.onerror = () => {
        if (live) setFailed(true);
      };
      element.src = url;
      return () => {
        live = false;
        canvasRef.current = null;
        image.current = undefined;
        URL.revokeObjectURL(url);
      };
    },
    [file],
  );

  const pointAt = (event: PointerEvent<HTMLCanvasElement>) =>
    canvasPoint(
      event.currentTarget.getBoundingClientRect(),
      event.currentTarget,
      event.clientX,
      event.clientY,
    );

  const undo = () => {
    done.current = done.current.slice(0, -1);
    setCount(done.current.length);
    paint();
  };

  const commitLabel = () => {
    if (label === undefined) return;
    setLabel(undefined);
    const added = textAnnotation(label.at, label.value);
    if (added === undefined) return;
    done.current = [...done.current, added];
    setCount(done.current.length);
    paint();
  };

  const render = async (): Promise<Blob | null> => {
    const canvas = canvasRef.current;
    if (canvas === null || !ready) return null;
    commitLabel();
    draft.current = undefined;
    paint();
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  };

  const copy = async () => {
    setCopied(undefined);
    const blob = await render();
    try {
      if (blob === null) throw new Error('render-failed');
      await copyImage(blob);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  };

  const finish = async () => {
    if (canvasRef.current === null || !ready) return;
    setBusy(true);
    const blob = await render();
    setBusy(false);
    if (blob === null) {
      setFailed(true);
      return;
    }
    onDone(new File([blob], annotatedName(file.name), { type: 'image/png' }), {
      note: note.trim(),
      annotations: done.current,
    });
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
    }
  };

  return (
    <PanelDialog
      title={t('bugReport.annotate.title')}
      description={t('bugReport.annotate.hint')}
      size="wide"
      closeLabel={t('bugReport.annotate.cancel')}
      onClose={onCancel}
      data={{ 'data-bug-report': 'annotate' }}
      secondary={
        failed ? (
          <span role="alert" {...stylex.props(styles.hint)}>
            {t('bugReport.annotate.failed')}
          </span>
        ) : canCopyImage() ? (
          <span {...stylex.props(styles.tools)}>
            <Button
              variant="ghost"
              icon={<IconCopyOutlineRegular size={16} />}
              disabled={!ready || busy}
              data-annotate-copy=""
              onClick={() => void copy()}
            >
              {t('bugReport.annotate.copy')}
            </Button>
            <span role="status" {...stylex.props(styles.hint)}>
              {copied === undefined
                ? ''
                : t(copied === 'done' ? 'bugReport.copied' : 'bugReport.copyFailed')}
            </span>
          </span>
        ) : undefined
      }
      actions={
        <>
          <Button variant="outline" onClick={onCancel}>
            {cancelLabel ?? t('bugReport.annotate.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void finish()}
            disabled={!ready || busy || failed}
          >
            {doneLabel ?? t('bugReport.annotate.done')}
          </Button>
        </>
      }
    >
      <div {...stylex.props(styles.body)} onKeyDown={onKey}>
        <div
          role="toolbar"
          aria-label={t('bugReport.annotate.tools')}
          {...stylex.props(styles.tools)}
        >
          {ANNOTATION_TOOLS.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={tool === name}
              data-annotate-tool={name}
              onClick={() => setTool(name)}
              {...stylex.props(styles.tool, tool === name && styles.pressed)}
            >
              <ToolIcon tool={name} />
              {t(`bugReport.annotate.tool.${name}`)}
            </button>
          ))}
          <span {...stylex.props(styles.spacer)} />
          <ChipButton label={t('bugReport.annotate.undo')} disabled={count === 0} onClick={undo} />
        </div>
        <div {...stylex.props(styles.stage)}>
          <div {...stylex.props(styles.frame)}>
            {label === undefined || canvasRef.current === null ? null : (
              <input
                autoFocus
                aria-label={t('bugReport.annotate.label')}
                placeholder={t('bugReport.annotate.labelPlaceholder')}
                maxLength={ANNOTATION_TEXT_CHARS}
                data-annotate-label=""
                value={label.value}
                onChange={(event) => setLabel({ ...label, value: event.currentTarget.value })}
                onBlur={commitLabel}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitLabel();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    setLabel(undefined);
                  }
                }}
                style={{
                  left: `${Math.min(70, (label.at[0] / canvasRef.current.width) * 100)}%`,
                  top: `${Math.min(90, (label.at[1] / canvasRef.current.height) * 100)}%`,
                }}
                {...stylex.props(styles.label)}
              />
            )}
            <canvas
              ref={mount}
              role="img"
              aria-label={file.name}
              data-annotate-canvas=""
              onPointerDown={(event) => {
                if (!ready) return;
                if (label !== undefined) {
                  event.preventDefault();
                  commitLabel();
                  return;
                }
                if (tool === 'text') {
                  event.preventDefault();
                  setLabel({ at: pointAt(event), value: '' });
                  return;
                }
                event.currentTarget.setPointerCapture?.(event.pointerId);
                draft.current = startAnnotation(tool, pointAt(event));
              }}
              onPointerMove={(event) => {
                if (draft.current === undefined) return;
                draft.current = extendAnnotation(draft.current, pointAt(event));
                paint();
              }}
              onPointerUp={() => {
                const finished =
                  draft.current === undefined ? undefined : finishAnnotation(draft.current);
                draft.current = undefined;
                if (finished !== undefined) {
                  done.current = [...done.current, finished];
                  setCount(done.current.length);
                  const canvas = canvasRef.current;
                  if (finished.tool === 'box' && canvas !== null)
                    setLabel({ at: boxNoteAnchor(finished, canvas), value: '' });
                }
                paint();
              }}
              onPointerCancel={() => {
                draft.current = undefined;
                paint();
              }}
              {...stylex.props(styles.canvas)}
            />
          </div>
        </div>
        <TextField
          label={t('bugReport.annotate.note')}
          value={note}
          onChange={setNote}
          maxLength={BUG_REPORT_NOTE_CHARS}
          placeholder={t('bugReport.annotate.notePlaceholder')}
          data-annotate-note=""
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void finish();
            }
          }}
        />
      </div>
    </PanelDialog>
  );
}
