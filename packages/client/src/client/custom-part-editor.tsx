import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';
import {
  AVATAR_COLORS,
  PART_SLOTS,
  PART_TONES,
  avatarSvg,
  createCustomPart,
  emptyPartLayer,
  fillPartLayer,
  gradientPartLayer,
  noisePartLayer,
  paintPartLayer,
  partLayer,
  partLinePoints,
  partRectPoints,
  partToneColor,
  shadePartLayer,
  withAvatarCustomPart,
  type PartSlot,
  type IllustratedAvatarRecipe,
  type PartColor,
  type PartInk,
  type PartLayer,
  type PartLayerName,
  type PartTone,
  type PixelCustomPart,
} from '../../../core/src/bots/avatar-appearance.js';
import type { BotHarnessTranslate } from './locale.js';

type Key = Parameters<BotHarnessTranslate>[0];
type Tool =
  | 'pencil'
  | 'eraser'
  | 'fill'
  | 'replace'
  | 'line'
  | 'rect'
  | 'gradient'
  | 'noise'
  | 'eyedropper';
type Layers = Record<PartLayerName, PartLayer>;
type Point = readonly [number, number];
interface Gesture {
  base: Layers;
  future: Layers[];
  from: Point;
  points: Point[];
  fixed: boolean;
}
interface Noise {
  base: Layers;
  seed: string;
  layer: PartLayerName;
  mirror: boolean;
}

const FIXED_COLORS: readonly PartColor[] = [
  '#efb93f',
  '#f4f1ec',
  '#1d1b22',
  '#e2565f',
  '#f06292',
  '#5a7be0',
  '#3d9970',
  '#8a5ad0',
];
const TOOLS: readonly Tool[] = [
  'pencil',
  'eraser',
  'fill',
  'replace',
  'line',
  'rect',
  'gradient',
  'noise',
  'eyedropper',
];
const SHADES = [
  ['off', 0],
  ['lighter', 1],
  ['darker', -1],
] as const;
const LONG_PRESS_MS = 500;
const TAP_MS = 250;
const STROKE_TOOLS = new Set<Tool>(['pencil', 'eraser', 'line', 'rect', 'gradient']);
const OFFSET_ROWS = 3;
const MIN_ZOOM = 6;
const MAX_ZOOM = 16;

function replaced(layer: PartLayer, from: PartInk | null, to: PartInk | null): PartLayer {
  if (!from) return layer;
  return layer.map((row) =>
    row.map((ink) => (ink && ink.color === from.color && ink.tone === from.tone ? to : ink)),
  );
}

function inkColor(recipe: IllustratedAvatarRecipe, ink: PartInk): string {
  const base = ink.color.startsWith('#') ? ink.color : recipe[ink.color as 'hairColor'];
  return partToneColor(base, ink.tone);
}

export function CustomPartEditor({
  slot = 'headpiece',
  note,
  backdrop: shownBehind,
  recipe,
  initial,
  onChange,
  onSave,
  onCancel,
  t,
}: {
  slot?: PartSlot | undefined;
  note?: string | undefined;
  backdrop?: IllustratedAvatarRecipe | undefined;
  recipe: IllustratedAvatarRecipe;
  initial?: PixelCustomPart | undefined;
  onChange(part: PixelCustomPart): void;
  onSave(part: PixelCustomPart, name: string): Promise<boolean>;
  onCancel(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const { width: W, height: H } = PART_SLOTS[slot];
  const hair = slot !== 'headpiece';
  const [layers, setLayers] = useState<Layers>(() => ({
    front: initial ? partLayer(slot, initial.front) : emptyPartLayer(slot),
    back: initial ? partLayer(slot, initial.back) : emptyPartLayer(slot),
  }));
  const [past, setPast] = useState<Layers[]>([]);
  const [future, setFuture] = useState<Layers[]>([]);
  const [layer, setLayer] = useState<PartLayerName>('front');
  const [tool, setTool] = useState<Tool>('pencil');
  const [mirror, setMirror] = useState(true);
  const [ink, setInk] = useState<PartInk>({ color: 'hairColor', tone: 0 });
  const [zoom, setZoom] = useState(10);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [shade, setShade] = useState<0 | 1 | -1>(0);
  const [gradientTo, setGradientTo] = useState<PartTone>(-2);
  const [dither, setDither] = useState<2 | 4>(4);
  const [noiseAmount, setNoiseAmount] = useState(0.4);
  const [noise, setNoise] = useState<Noise | undefined>();
  const [offset, setOffset] = useState(false);
  const [cursor, setCursor] = useState<Point | undefined>();
  const gesture = useRef<Gesture | undefined>(undefined);
  const touches = useRef(new Set<number>());
  const most = useRef(0);
  const press = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touchStart = useRef({ at: 0, moved: false, tap: true });
  const pendingPick = useRef<Point | undefined>(undefined);
  const grid = useRef<HTMLDivElement>(null);
  const bare = useMemo(() => withAvatarCustomPart(recipe, slot, undefined), [recipe]);
  const part = useMemo(() => createCustomPart(slot, layers), [layers]);
  const wearing = useMemo(() => withAvatarCustomPart(recipe, slot, part), [recipe, part]);
  const backdrop = useMemo(() => avatarSvg(shownBehind ?? bare), [shownBehind, bare]);
  const preview = useMemo(() => avatarSvg(wearing), [wearing]);
  const empty = part.front.length === 0 && part.back.length === 0;

  const commit = (next: Layers) => {
    setLayers(next);
    onChange(createCustomPart(slot, next));
  };
  const record = () => {
    setPast((stack) => [...stack, layers]);
    setFuture([]);
    setNoise(undefined);
  };
  const noised = (state: Noise, amount: number): Layers => ({
    ...state.base,
    [state.layer]: noisePartLayer(slot, state.base[state.layer], amount, state.seed, state.mirror),
  });
  const draw = (current: Gesture, to: Point, snap: boolean): Layers => {
    const { base, from, points } = current;
    const value = tool === 'eraser' ? null : ink;
    const target = base[layer];
    const next =
      tool === 'fill'
        ? fillPartLayer(slot, target, from[0], from[1], value, mirror)
        : tool === 'replace'
          ? replaced(target, target[from[1]]![from[0]] ?? null, value)
          : tool === 'line'
            ? paintPartLayer(slot, target, partLinePoints(from, to, snap), value, mirror)
            : tool === 'rect'
              ? paintPartLayer(slot, target, partRectPoints(from, to, snap), value, mirror)
              : tool === 'gradient'
                ? gradientPartLayer(slot, target, from, to, ink.color, ink.tone, gradientTo, {
                    dither,
                    mirror,
                  })
                : tool === 'pencil' && shade !== 0
                  ? shadePartLayer(slot, target, points, shade, mirror)
                  : paintPartLayer(slot, target, points, value, mirror);
    return { ...base, [layer]: next };
  };
  const pick = ([x, y]: Point) => {
    const found = layers[layer][y]![x] ?? layers[layer === 'front' ? 'back' : 'front'][y]![x];
    if (!found) return;
    setInk(found);
    if (tool === 'eraser' || tool === 'eyedropper') setTool('pencil');
  };
  const begin = (point: Point, alt: boolean, touch = false) => {
    if (alt || tool === 'eyedropper') {
      if (touch) pendingPick.current = point;
      else pick(point);
      return;
    }
    const fixed = tool === 'fill' || tool === 'noise' || tool === 'replace';
    const current = { base: layers, future, from: point, points: [point], fixed };
    record();
    if (tool === 'noise') {
      const state = { base: layers, seed: Math.random().toString(36).slice(2), layer, mirror };
      setNoise(state);
      commit(noised(state, noiseAmount));
    } else commit(draw(current, point, false));
    gesture.current = fixed && !touch ? undefined : current;
  };
  const move = (point: Point, snap: boolean) => {
    const current = gesture.current;
    if (!current || current.fixed) return;
    const last = current.points.at(-1)!;
    if (last[0] === point[0] && last[1] === point[1]) return;
    current.points = [...current.points, ...partLinePoints(last, point).slice(1)];
    commit(draw(current, point, snap));
  };
  const end = (point: Point | undefined, snap: boolean) => {
    const current = gesture.current;
    gesture.current = undefined;
    if (current && !current.fixed && point && tool !== 'pencil' && tool !== 'eraser')
      commit(draw(current, point, snap));
  };
  const cancel = () => {
    const current = gesture.current;
    gesture.current = undefined;
    if (!current) return;
    setPast((stack) => stack.slice(0, -1));
    setFuture(current.future);
    setNoise(undefined);
    commit(current.base);
  };
  const reroll = () => {
    if (!noise) return;
    const seed = Math.random().toString(36).slice(2);
    setNoise({ ...noise, seed });
    commit(noised({ ...noise, seed }, noiseAmount));
  };
  const changeAmount = (amount: number) => {
    setNoiseAmount(amount);
    if (noise) commit(noised(noise, amount));
  };
  const undo = () => {
    const previous = past.at(-1);
    if (!previous) return;
    setPast(past.slice(0, -1));
    setFuture([layers, ...future]);
    setNoise(undefined);
    commit(previous);
  };
  const redo = () => {
    const [next, ...rest] = future;
    if (!next) return;
    setFuture(rest);
    setPast([...past, layers]);
    setNoise(undefined);
    commit(next);
  };
  const cellAt = (event: ReactPointerEvent, clamp = true): Point | undefined => {
    const box = grid.current?.getBoundingClientRect();
    if (box && box.width > 0 && typeof event.clientX === 'number') {
      const x = Math.floor((event.clientX - box.left) / zoom);
      const y = Math.floor((event.clientY - box.top) / zoom);
      if (!clamp && (x < 0 || x >= W || y < 0 || y >= H)) return undefined;
      return [Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y))];
    }
    const cell = (event.target as Element | null)?.closest?.('[data-part-cell]');
    const [x, y] = (cell?.getAttribute('data-part-cell') ?? '').split(',').map(Number);
    return cell ? [x!, y!] : undefined;
  };
  const aim = (point: Point): Point => [point[0], Math.max(0, point[1] - OFFSET_ROWS)];
  const clearPress = () => {
    if (press.current) clearTimeout(press.current);
    press.current = undefined;
  };
  const colored = ([x, y]: Point) =>
    !!(layers[layer][y]![x] ?? layers[layer === 'front' ? 'back' : 'front'][y]![x]);
  const onDown = (event: ReactPointerEvent) => {
    event.preventDefault();
    const touch = event.pointerType === 'touch';
    if (touch) {
      touches.current.add(event.pointerId);
      most.current = Math.max(most.current, touches.current.size);
      if (touches.current.size === 1)
        touchStart.current = { at: Date.now(), moved: false, tap: true };
      else {
        clearPress();
        pendingPick.current = undefined;
        const { at, moved } = touchStart.current;
        if (Date.now() - at > TAP_MS || moved) touchStart.current.tap = false;
        else cancel();
        return;
      }
    }
    const point = cellAt(event, false);
    if (!point) return;
    if (offset) {
      setCursor(aim(point));
      return;
    }
    begin(point, event.altKey, touch);
    if (touch && STROKE_TOOLS.has(tool) && colored(point))
      press.current = setTimeout(() => {
        press.current = undefined;
        cancel();
        pick(point);
      }, LONG_PRESS_MS);
  };
  const onMove = (event: ReactPointerEvent) => {
    const point = cellAt(event);
    if (!point) return;
    if (offset) {
      if (touches.current.size > 0 || event.pointerType !== 'touch') {
        const target = aim(point);
        if (cursor?.join() !== target.join()) setCursor(target);
        move(target, event.shiftKey);
      }
      return;
    }
    const current = gesture.current;
    if (current && current.points.at(-1)?.join() !== point.join()) {
      clearPress();
      touchStart.current.moved = true;
    }
    move(point, event.shiftKey);
  };
  const onUp = (event: ReactPointerEvent) => {
    clearPress();
    if (event.pointerType === 'touch') {
      touches.current.delete(event.pointerId);
      if (touches.current.size > 0) return;
      const count = most.current;
      most.current = 0;
      if (count > 1) {
        if (touchStart.current.tap) {
          if (count === 2) undo();
          if (count === 3) redo();
        } else end(gesture.current?.points.at(-1), false);
        return;
      }
      const picked = pendingPick.current;
      pendingPick.current = undefined;
      if (picked) pick(picked);
    }
    if (!offset || gesture.current)
      end(cellAt(event) ?? gesture.current?.points.at(-1), event.shiftKey);
  };
  const onAbort = (event: ReactPointerEvent) => {
    clearPress();
    pendingPick.current = undefined;
    touches.current.delete(event.pointerId);
    if (touches.current.size === 0) most.current = 0;
    cancel();
  };
  const save = async () => {
    if (empty || busy) return;
    setBusy(true);
    const saved = await onSave(part, name.trim());
    setBusy(false);
    setFailed(!saved);
  };

  const cells: ReactElement[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const own = layers[layer][y]![x];
      const other = layers[layer === 'front' ? 'back' : 'front'][y]![x];
      const shown = own ?? other;
      cells.push(
        <span
          key={`${x},${y}`}
          className="bh-part-cell"
          data-part-cell={`${x},${y}`}
          data-part-ink={own ? `${own.color}:${own.tone}` : undefined}
          data-part-other={!own && other ? 'true' : undefined}
          style={shown ? { background: inkColor(recipe, shown) } : undefined}
        />,
      );
    }

  const rows: { key: string; label: string; color: PartColor }[] = [
    ...AVATAR_COLORS.map((color) => ({
      key: color,
      label: t(`profile.avatar.${color}` as Key),
      color: color as PartColor,
    })),
    ...FIXED_COLORS.map((color) => ({ key: color, label: color, color })),
  ];

  return (
    <div className="bh-part-editor" data-part-editor>
      <div className="bh-part-toolbar" role="toolbar" aria-label={t('profile.avatar.part.tools')}>
        {TOOLS.map((value) => (
          <button
            key={value}
            type="button"
            className="bh-avatar-category"
            data-part-tool={value}
            aria-pressed={tool === value}
            onClick={() => setTool(value)}
          >
            {t(`profile.avatar.part.tool.${value}` as Key)}
          </button>
        ))}
        <button
          type="button"
          className="bh-avatar-category"
          data-part-mirror
          aria-pressed={mirror}
          onClick={() => setMirror(!mirror)}
        >
          {t('profile.avatar.part.mirror')}
        </button>
        <span className="bh-part-divider" aria-hidden="true" />
        {(hair ? [] : (['front', 'back'] as const)).map((value) => (
          <button
            key={value}
            type="button"
            className="bh-avatar-category"
            data-part-layer={value}
            aria-pressed={layer === value}
            onClick={() => setLayer(value)}
          >
            {t(`profile.avatar.part.layer.${value}` as Key)}
          </button>
        ))}
        <span className="bh-part-divider" aria-hidden="true" />
        <button type="button" data-part-undo disabled={past.length === 0} onClick={undo}>
          {t('profile.avatar.part.undo')}
        </button>
        <button type="button" data-part-redo disabled={future.length === 0} onClick={redo}>
          {t('profile.avatar.part.redo')}
        </button>
        <button
          type="button"
          data-part-zoom-out
          disabled={zoom <= MIN_ZOOM}
          aria-label={t('profile.avatar.part.zoomOut')}
          onClick={() => setZoom(zoom - 2)}
        >
          −
        </button>
        <button
          type="button"
          data-part-zoom-in
          disabled={zoom >= MAX_ZOOM}
          aria-label={t('profile.avatar.part.zoomIn')}
          onClick={() => setZoom(zoom + 2)}
        >
          +
        </button>
        <button
          type="button"
          className="bh-avatar-category"
          data-part-offset
          aria-pressed={offset}
          onClick={() => {
            setOffset(!offset);
            setCursor(undefined);
          }}
        >
          {t('profile.avatar.part.offset')}
        </button>
      </div>
      <div className="bh-part-options" data-part-options={tool}>
        {tool === 'pencil' ? (
          <span role="group" aria-label={t('profile.avatar.part.shade')}>
            <small>{t('profile.avatar.part.shade')}</small>
            {SHADES.map(([key, value]) => (
              <button
                key={key}
                type="button"
                className="bh-avatar-category"
                data-part-shade={key}
                aria-pressed={shade === value}
                onClick={() => setShade(value)}
              >
                {t(`profile.avatar.part.shade.${key}` as Key)}
              </button>
            ))}
          </span>
        ) : null}
        {tool === 'gradient' ? (
          <>
            <span role="group" aria-label={t('profile.avatar.part.gradientTo')}>
              <small>{t('profile.avatar.part.gradientTo')}</small>
              {PART_TONES.map((tone) => (
                <button
                  key={tone}
                  type="button"
                  className="bh-part-swatch"
                  data-part-gradient-to={tone}
                  aria-label={`${t('profile.avatar.part.gradientTo')} ${tone}`}
                  aria-pressed={gradientTo === tone}
                  style={{ background: inkColor(recipe, { color: ink.color, tone }) }}
                  onClick={() => setGradientTo(tone)}
                />
              ))}
            </span>
            <span role="group" aria-label={t('profile.avatar.part.dither')}>
              <small>{t('profile.avatar.part.dither')}</small>
              {([4, 2] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  className="bh-avatar-category"
                  data-part-dither={size}
                  aria-pressed={dither === size}
                  onClick={() => setDither(size)}
                >
                  {t(`profile.avatar.part.dither.${size}` as Key)}
                </button>
              ))}
            </span>
          </>
        ) : null}
        {tool === 'noise' ? (
          <span>
            <label>
              <small>{t('profile.avatar.part.noiseAmount')}</small>
              <input
                type="range"
                data-part-noise-amount
                min={0.1}
                max={1}
                step={0.1}
                value={noiseAmount}
                onChange={(event) => changeAmount(Number(event.target.value))}
              />
            </label>
            <button type="button" data-part-reroll disabled={!noise} onClick={reroll}>
              {t('profile.avatar.part.reroll')}
            </button>
          </span>
        ) : null}
        <small className="bh-part-hint">{t('profile.avatar.part.toolHint')}</small>
      </div>
      <div className="bh-part-workspace">
        <div
          className="bh-part-canvas"
          data-part-canvas
          data-part-zoom={zoom}
          style={{ width: W * zoom, height: W * zoom }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onAbort}
          onPointerLeave={(event) => {
            if (event.pointerType !== 'touch' && !offset) onUp(event);
          }}
        >
          <span
            className="bh-part-backdrop"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: backdrop }}
          />
          <div
            ref={grid}
            className="bh-part-grid"
            style={{
              gridTemplateColumns: `repeat(${W}, ${zoom}px)`,
              gridTemplateRows: `repeat(${H}, ${zoom}px)`,
            }}
          >
            {cells}
          </div>
          {offset && cursor ? (
            <span
              className="bh-part-cursor"
              data-part-cursor={cursor.join(',')}
              aria-hidden="true"
              style={{ left: cursor[0] * zoom, top: cursor[1] * zoom, width: zoom, height: zoom }}
            />
          ) : null}
        </div>
        {offset ? (
          <button
            type="button"
            className="bh-part-draw"
            data-part-offset-draw
            disabled={!cursor}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture?.(event.pointerId);
              if (cursor) begin(cursor, false);
            }}
            onPointerUp={() => end(cursor, false)}
            onPointerCancel={() => cancel()}
            onLostPointerCapture={() => end(cursor, false)}
            onClick={(event) => {
              if (event.detail !== 0 || !cursor) return;
              begin(cursor, false);
              end(cursor, false);
            }}
          >
            {t('profile.avatar.part.offsetDraw')}
          </button>
        ) : null}
        <div className="bh-part-side">
          <div className="bh-part-preview" data-part-preview>
            <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: preview }} />
            <small>{t('profile.avatar.part.preview')}</small>
          </div>
          <div
            className="bh-part-palette"
            role="group"
            aria-label={t('profile.avatar.part.colors')}
          >
            {rows.map((row) => (
              <div key={row.key} className="bh-part-palette-row" title={row.label}>
                {PART_TONES.map((tone) => {
                  const value = { color: row.color, tone };
                  return (
                    <button
                      key={tone}
                      type="button"
                      className="bh-part-swatch"
                      data-part-ink={`${row.color}:${tone}`}
                      aria-label={`${row.label} ${tone}`}
                      aria-pressed={ink.color === row.color && ink.tone === tone}
                      style={{ background: inkColor(recipe, value) }}
                      onClick={() => {
                        setInk(value);
                        if (tool === 'eraser') setTool('pencil');
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {note ? (
        <p className="bh-avatar-hidden-note" data-part-note>
          {note}
        </p>
      ) : null}
      <label className="bh-part-name">
        <span>{t('profile.avatar.part.name')}</span>
        <input
          data-part-name
          value={name}
          maxLength={60}
          placeholder={t('profile.avatar.part.namePlaceholder')}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      {failed ? <p role="alert">{t('profile.avatar.part.saveFailed')}</p> : null}
      <div className="bh-avatar-editor-actions">
        <button type="button" data-part-save disabled={empty || busy} onClick={() => void save()}>
          {t('profile.avatar.part.save')}
        </button>
        <button type="button" data-part-cancel disabled={busy} onClick={onCancel}>
          {t('profile.avatar.part.cancel')}
        </button>
      </div>
    </div>
  );
}
