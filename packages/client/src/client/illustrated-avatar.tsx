import { useMemo, useRef, type ReactElement } from 'react';
import {
  AVATAR_TURNS,
  avatarSvg,
  LINE_TOOL_SYMBOLS,
  lineMorphFace,
  pixelFaceCells,
  pixelSymbolCells,
  type AvatarRecipe,
  type PixelCell,
  type PixelSymbol,
  type PixelMouthState,
} from '../../../core/src/bots/avatar-appearance.js';
import { morphPixels, pixelPathMarkup, type PixelMorphRun } from '@botharness/pixel-morph';
import { seededRandom } from '../../../core/src/bots/avatar-random.js';
import type { Sampled } from 'morphicons';
import {
  lineMorphD,
  morphLinePath,
  sampleLineFace,
  sampleLineSymbol,
  type LineMorphRun,
} from './line-morph.js';
import { useMountedResource } from './mounted-resource.js';
import { AvatarSpeech } from './avatar-speech.js';
import type { PersonaBotActivityEffect, PersonaBotActivityState } from './avatar.js';

type Step = readonly [number, number];

const HEAD_STEPS: Record<PersonaBotActivityEffect, readonly Step[]> = {
  'thinking-dots': [
    [0, 0],
    [0, -1],
    [0, -1],
    [0, 0],
  ],
  searching: [
    [0, 0],
    [-1, 0],
    [0, 0],
    [1, 0],
  ],
  coding: [
    [0, 0],
    [0, 1],
    [0, 1],
    [0, 0],
  ],
  executing: [
    [0, 0],
    [0, -1],
    [0, 0],
    [0, -1],
  ],
  'generic-working': [
    [0, 0],
    [0, -1],
    [0, 0],
    [0, 0],
  ],
};

const GAZE_STEPS: Record<PersonaBotActivityEffect, readonly Step[]> = {
  'thinking-dots': [
    [0, 0],
    [-1, -1],
    [-1, -1],
    [0, 0],
  ],
  searching: [
    [0, 0],
    [-1, 0],
    [0, 0],
    [1, 0],
  ],
  coding: [
    [0, 0],
    [0, 1],
    [0, 1],
    [0, 0],
  ],
  executing: [
    [0, 0],
    [1, 0],
    [1, 0],
    [0, 0],
  ],
  'generic-working': [
    [0, 0],
    [0, 0],
    [1, 0],
    [0, 0],
  ],
};

const LARGE_SPRING = { k: 420, c: 30 };
const SMALL_SPRING = { k: 760, c: 54 };

interface LineShown {
  key?: PixelSymbol | 'face';
  shape?: Sampled[];
  velocity: number;
  since: number;
}

export const PIXEL_MORPH_MS = 800;
export const PIXEL_SYMBOL_HOLD_MS = 500;
export const PIXEL_FRAME_MS = 50;

interface PixelShown {
  key?: PixelSymbol | 'face';
  cells?: PixelCell[];
  since: number;
}

const TURN_STEPS = 40;
const TURN_STEP_MS = 220;

function turnSchedule(phase: number): number[] {
  const steps = [0, ...AVATAR_TURNS].sort((a, b) => a - b);
  return Array.from({ length: TURN_STEPS }, (_, index) => {
    const t = (index / TURN_STEPS) * Math.PI * 2;
    const noise =
      0.62 * Math.sin(t + phase) +
      0.3 * Math.sin(3 * t + phase * 1.7 + 1.3) +
      0.22 * Math.sin(5 * t + phase * 0.6 + 0.4);
    const scaled = Math.max(-1, Math.min(1, noise / 0.85));
    return steps[Math.round(((scaled + 1) / 2) * (steps.length - 1))]!;
  });
}

const shift = ([x, y]: Step) => `translate(${x}px, ${y}px)`;
const stepped = (steps: readonly Step[], blinkAt?: number): Keyframe[] =>
  steps.map((step, index) => ({
    offset: index / steps.length,
    transform: shift(step),
    opacity: index === blinkAt ? 0 : 1,
    easing: 'steps(1, end)',
  }));
const blinkFrames = (blinkAt: number, count: number): Keyframe[] =>
  Array.from({ length: count }, (_, index) => ({
    offset: index / count,
    opacity: index === blinkAt ? 1 : 0,
    easing: 'steps(1, end)',
  }));

export function IllustratedAvatar({
  personaBotId,
  recipe,
  state,
  effect,
  size,
  symbol,
  surface = 'portrait',
  still = false,
  mouth = 'saved',
}: {
  personaBotId: string;
  recipe: AvatarRecipe;
  state: PersonaBotActivityState;
  effect: PersonaBotActivityEffect;
  size: number;
  symbol?: PixelSymbol | undefined;
  mouth?: PixelMouthState | undefined;
  surface?: 'portrait' | 'companion' | undefined;
  still?: boolean | undefined;
}): ReactElement {
  const blinkTiming = useMemo(() => {
    const random = seededRandom(`botharness-blink:${personaBotId}`);
    return { duration: 4400 + random() * 1600, phase: random() * 0.75 };
  }, [personaBotId]);
  const speech = surface === 'companion' && recipe.family === 'illustrated';
  const turning = !still && (state === 'thinking' || state === 'working') && size > 64;
  const markup = useMemo(
    () =>
      avatarSvg(recipe, {
        surface,
        mouthLayers: speech,
        ...(turning ? { turns: AVATAR_TURNS } : {}),
      }),
    [recipe, turning, surface, speech],
  );
  const line = useRef<LineShown>({ velocity: 0, since: 0 });
  const pixel = useRef<PixelShown>({ since: 0 });
  const seen = useRef(true);
  const mount = useMountedResource<HTMLSpanElement>(
    (node) => {
      const morphPath = node.querySelector<SVGPathElement>('path[data-avatar-transition]');
      const head = node.querySelector<SVGGElement>('.bh-illustrated-head');
      const gaze = node.querySelector<SVGGElement>('.bh-illustrated-gaze');
      const blink = node.querySelector<SVGGElement>('.bh-illustrated-blink');
      const pixelGroup = node.querySelector<SVGGElement>('[data-avatar-pixel-morph]');
      if (!head || !gaze || !blink || typeof head.animate !== 'function') return;
      const animations = new Set<Animation>();
      let visible = seen.current;
      let disposed = false;
      let revision = 0;
      let run: { run: LineMorphRun; key: PixelSymbol | 'face' } | undefined;
      let lineTimer: ReturnType<typeof setTimeout> | undefined;
      let pixelRun: { run: PixelMorphRun; key: PixelSymbol | 'face' } | undefined;
      let pixelTimer: ReturnType<typeof setTimeout> | undefined;
      const halt = () => {
        if (pixelTimer) clearTimeout(pixelTimer);
        pixelTimer = undefined;
        if (pixelRun) {
          pixel.current = { key: pixelRun.key, cells: pixelRun.run.current(), since: 0 };
          pixelRun.run.cancel();
          pixelRun = undefined;
        }
        if (lineTimer) clearTimeout(lineTimer);
        lineTimer = undefined;
        if (run) {
          line.current = {
            key: run.key,
            shape: run.run.current(),
            velocity: run.run.velocity(),
            since: 0,
          };
          run.run.cancel();
          run = undefined;
        }
      };
      const stop = () => {
        halt();
        for (const animation of animations) animation.cancel();
        animations.clear();
      };
      const fade = (target: SVGElement, to: number, duration: number) => {
        const from = Number(getComputedStyle(target).opacity || '1');
        target.style.opacity = String(to);
        if (from !== to) {
          const animation = target.animate([{ opacity: from }, { opacity: to }], {
            duration,
            easing: 'ease-in-out',
          });
          animations.add(animation);
          void animation.finished.then(() => animations.delete(animation)).catch(() => undefined);
        }
      };
      const spring = () => (size <= 64 ? SMALL_SPRING : LARGE_SPRING);
      const showLine = (still: boolean): Promise<unknown> => {
        if (!morphPath || recipe.family !== 'line') return Promise.resolve();
        const path = morphPath;
        const compact = size <= 64;
        const blend = compact ? 120 : 200;
        const target = symbol ?? 'face';
        const shapeFor = (key: PixelSymbol | 'face') =>
          key === 'face'
            ? sampleLineFace(lineMorphFace(recipe))
            : sampleLineSymbol(LINE_TOOL_SYMBOLS[key], compact ? 0.8 : 1);
        const settleOn = (key: PixelSymbol | 'face') => {
          if (key === 'face') {
            path.style.opacity = '0';
            head.style.opacity = '';
            return;
          }
          path.setAttribute('d', lineMorphD(shapeFor(key)));
          path.style.opacity = '1';
          head.style.opacity = '0';
        };
        const previous = line.current;
        if (still || previous.key === undefined) {
          settleOn(target);
          line.current = { key: target, velocity: 0, since: performance.now() };
          return Promise.resolve();
        }
        if (previous.key === target && !previous.shape) {
          settleOn(target);
          return Promise.resolve();
        }
        const from = previous.shape ?? shapeFor(previous.key);
        path.setAttribute('d', lineMorphD(from));
        const fromFace = previous.key === 'face' && !previous.shape;
        if (fromFace) {
          fade(head, 0, blend);
          fade(path, 1, blend);
        } else {
          path.style.opacity = '1';
          head.style.opacity = '0';
        }
        return new Promise<void>((resolve) => {
          const start = () => {
            lineTimer = undefined;
            const reveal =
              target === 'face'
                ? () => {
                    fade(path, 0, blend * 1.4);
                    fade(head, 1, blend * 1.4);
                  }
                : undefined;
            const current = morphLinePath(
              path,
              from,
              shapeFor(target),
              spring(),
              previous.velocity,
              reveal,
            );
            run = { run: current, key: target };
            void current.finished.then((done) => {
              if (!done) return;
              run = undefined;
              line.current = { key: target, velocity: 0, since: performance.now() };
              resolve();
            });
          };
          const held = performance.now() - previous.since;
          const delay = fromFace
            ? blend * 0.6
            : !previous.shape && held < PIXEL_SYMBOL_HOLD_MS
              ? PIXEL_SYMBOL_HOLD_MS - held
              : 0;
          if (delay > 0) lineTimer = setTimeout(start, delay);
          else start();
        });
      };
      const showPixels = (still: boolean) => {
        if (!pixelGroup || recipe.family !== 'illustrated') return;
        const svg = pixelGroup.ownerSVGElement;
        const target = symbol ?? 'face';
        const cellsFor = (key: PixelSymbol | 'face') =>
          key === 'face' ? pixelFaceCells(recipe) : pixelSymbolCells(key, recipe.hairColor);
        const draw = (key: PixelSymbol | 'face', cells?: readonly PixelCell[]) => {
          if (key === 'face' && !cells) {
            pixelGroup.innerHTML = '';
            svg?.removeAttribute('data-pixel-cover');
            return;
          }
          pixelGroup.innerHTML = pixelPathMarkup(cells ?? cellsFor(key));
          svg?.setAttribute('data-pixel-cover', '');
        };
        const previous = pixel.current;
        if (still || previous.key === undefined) {
          draw(target);
          pixel.current = { key: target, since: performance.now() };
          return;
        }
        if (previous.key === target && !previous.cells) {
          draw(target);
          return;
        }
        const from = previous.cells ?? cellsFor(previous.key);
        draw(previous.key, from);
        const start = () => {
          pixelTimer = undefined;
          const run = morphPixels(pixelGroup, from, cellsFor(target), PIXEL_MORPH_MS, {
            frameMs: PIXEL_FRAME_MS,
            markup: pixelPathMarkup,
          });
          pixelRun = { run, key: target };
          void run.finished.then((done) => {
            if (!done) return;
            pixelRun = undefined;
            pixel.current = { key: target, since: performance.now() };
            if (target === 'face') draw('face');
          });
        };
        const held = performance.now() - previous.since;
        if (!previous.cells && previous.key !== 'face' && held < PIXEL_SYMBOL_HOLD_MS)
          pixelTimer = setTimeout(start, PIXEL_SYMBOL_HOLD_MS - held);
        else start();
      };
      const loop = (target: Element, frames: Keyframe[], duration: number, delay = 0) =>
        animations.add(target.animate(frames, { duration, delay, iterations: Infinity }));
      const eyeLoop = (steps: readonly Step[], duration: number) => {
        const delay = -blinkTiming.phase * duration;
        loop(gaze, stepped(steps, steps.length - 1), duration, delay);
        loop(blink, blinkFrames(steps.length - 1, steps.length), duration, delay);
      };
      const settled = () => animations.size === 0 && !run && !lineTimer && !pixelRun;
      const sync = () => {
        const currentRevision = ++revision;
        const moving = !settled();
        const start = moving ? getComputedStyle(head).transform : 'none';
        const gazeStart = moving ? getComputedStyle(gaze).transform : 'none';
        stop();
        head.style.transform = 'none';
        gaze.style.transform = 'none';
        head.style.opacity = '';
        if (morphPath) morphPath.style.opacity = '';
        if (
          disposed ||
          still ||
          !visible ||
          document.hidden ||
          document.documentElement.dataset['botharnessMotion'] === 'reduce' ||
          document.documentElement.dataset['botharnessActivity'] === 'stale'
        ) {
          if (!disposed) {
            showPixels(true);
            void showLine(true);
          }
          return;
        }
        showPixels(false);
        const morphing = showLine(false);
        const compact = size <= 64;
        const enter = head.animate([{ transform: start || 'none' }, { transform: 'none' }], {
          duration: 120,
          easing: 'steps(2, end)',
        });
        animations.add(enter);
        const gazeEnter = gaze.animate(
          [{ transform: gazeStart || 'none' }, { transform: 'none' }],
          { duration: 120, easing: 'steps(2, end)' },
        );
        animations.add(gazeEnter);
        Promise.all([enter.finished, gazeEnter.finished, morphing])
          .then(() => {
            animations.delete(enter);
            animations.delete(gazeEnter);
            if (
              (recipe.family === 'line' && symbol !== undefined) ||
              disposed ||
              currentRevision !== revision ||
              still ||
              !visible ||
              document.hidden ||
              document.documentElement.dataset['botharnessMotion'] === 'reduce' ||
              document.documentElement.dataset['botharnessActivity'] === 'stale'
            )
              return;
            if (state !== 'thinking' && state !== 'working') {
              if (compact || state !== 'idle') return;
              const rest: Step[] = Array.from({ length: 12 }, () => [0, 0]);
              eyeLoop(rest, blinkTiming.duration);
              return;
            }
            const turns = [...node.querySelectorAll<SVGGElement>('[data-avatar-turn]')];
            const body = node.querySelector<SVGGElement>('.bh-illustrated-body');
            if (state === 'thinking' && turns.length && body) {
              const schedule = turnSchedule((markup.length % 97) / 15.4);
              const frames = (delta: number): Keyframe[] =>
                schedule.map((value, index) => ({
                  offset: index / schedule.length,
                  opacity: value === delta ? 1 : 0,
                  easing: 'steps(1, end)',
                }));
              const duration = TURN_STEPS * TURN_STEP_MS;
              loop(head, frames(0), duration);
              loop(body, frames(0), duration);
              for (const turn of turns)
                loop(turn, frames(Number(turn.dataset['avatarTurn'])), duration);
              return;
            }
            loop(head, stepped(HEAD_STEPS[effect]), compact ? 1200 : 1600);
            if (compact) return;
            const gazeSteps = [...GAZE_STEPS[effect], [0, 0] as Step];
            eyeLoop(gazeSteps, 2000);
          })
          .catch(() => undefined);
      };
      const observer =
        typeof IntersectionObserver === 'undefined'
          ? undefined
          : new IntersectionObserver((entries) => {
              const next = entries.some((entry) => entry.isIntersecting);
              if (next === visible) return;
              seen.current = visible = next;
              sync();
            });
      observer?.observe(node);
      const motion = new MutationObserver(sync);
      motion.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-botharness-motion', 'data-botharness-activity'],
      });
      document.addEventListener('visibilitychange', sync);
      sync();
      return () => {
        disposed = true;
        if (settled()) {
          stop();
        } else {
          const pose = getComputedStyle(head).transform;
          const gazePose = getComputedStyle(gaze).transform;
          const headOpacity = getComputedStyle(head).opacity;
          stop();
          head.style.transform = pose;
          gaze.style.transform = gazePose;
          head.style.opacity = headOpacity;
        }
        observer?.disconnect();
        motion.disconnect();
        document.removeEventListener('visibilitychange', sync);
      };
    },
    [state, effect, size, markup, recipe, symbol, still, blinkTiming],
  );
  return (
    <>
      <span
        ref={mount}
        className="bh-avatar-media bh-avatar-media-composed"
        dangerouslySetInnerHTML={{ __html: markup }}
      />
      {speech && <AvatarSpeech markup={markup} mouth={mouth} still={still} />}
    </>
  );
}
