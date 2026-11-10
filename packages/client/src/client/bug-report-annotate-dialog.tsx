import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import {
  ANNOTATION_TOOLS,
  annotatedName,
  canvasPoint,
  extendAnnotation,
  finishAnnotation,
  paintAnnotation,
  previewAnnotation,
  startAnnotation,
  strokeWidth,
  type Annotation,
  type AnnotationDraft,
  type AnnotationTool,
} from './bug-report-annotate.js';
import { ChipButton } from './ds/chip-button.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { border, color, dialog, radius, size, space, text } from './ds/tokens.stylex.js';
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
    minHeight: size.icon,
    paddingBlock: space.x1,
    paddingInline: space.x3,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: { default: color.muted, ':hover': color.fg },
    fontFamily: 'inherit',
    fontSize: text.metaSize,
    lineHeight: text.bodyLine,
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '-2px',
  },
  pressed: {
    borderColor: color.accent,
    backgroundColor: { default: color.accentTint, ':hover': color.accentTint },
    color: { default: color.accentText, ':hover': color.accentText },
  },
});

export function AnnotateDialog({
  file,
  t,
  onCancel,
  onDone,
}: {
  file: File;
  t: BotHarnessTranslate;
  onCancel(): void;
  onDone(next: File): void;
}): ReactElement {
  const [tool, setTool] = useState<AnnotationTool>('box');
  const [count, setCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const image = useRef<CanvasImageSource | undefined>(undefined);
  const done = useRef<Annotation[]>([]);
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

  const finish = async () => {
    const canvas = canvasRef.current;
    if (canvas === null || !ready) return;
    setBusy(true);
    draft.current = undefined;
    paint();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    setBusy(false);
    if (blob === null) {
      setFailed(true);
      return;
    }
    onDone(new File([blob], annotatedName(file.name), { type: 'image/png' }));
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
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
        ) : undefined
      }
      actions={
        <>
          <Button variant="outline" onClick={onCancel}>
            {t('bugReport.annotate.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void finish()}
            disabled={!ready || busy || failed}
          >
            {t('bugReport.annotate.done')}
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
              {t(`bugReport.annotate.tool.${name}`)}
            </button>
          ))}
          <span {...stylex.props(styles.spacer)} />
          <ChipButton label={t('bugReport.annotate.undo')} disabled={count === 0} onClick={undo} />
        </div>
        <div {...stylex.props(styles.stage)}>
          <canvas
            ref={mount}
            role="img"
            aria-label={file.name}
            data-annotate-canvas=""
            onPointerDown={(event) => {
              if (!ready) return;
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
    </PanelDialog>
  );
}
