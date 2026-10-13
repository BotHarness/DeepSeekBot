import { useRef, type ReactElement } from 'react';
import type { PixelMouthState } from '../../../core/src/bots/avatar-appearance.js';
import { useMountedResource } from './mounted-resource.js';

export function AvatarSpeech({
  markup,
  mouth,
  still,
}: {
  markup: string;
  mouth: PixelMouthState;
  still: boolean;
}): ReactElement {
  const visible = useRef(true);
  const spoken = useRef(mouth);
  spoken.current = mouth;
  const speak = useRef<(() => void) | undefined>(undefined);
  const mount = useMountedResource<HTMLSpanElement>(
    (marker) => {
      const root = marker.previousElementSibling;
      if (!(root instanceof HTMLElement)) return;
      const layers = [...root.querySelectorAll<SVGGElement>('[data-avatar-mouth]')];
      const cover = root.querySelector<SVGGElement>('[data-avatar-pixel-morph]');
      const svg = cover?.ownerSVGElement;
      if (cover) layers.push(cover);
      const shownOpacity = new Map(
        layers.map((layer) => [layer, layer.style.opacity || layer.getAttribute('opacity') || '1']),
      );
      const animations = new Map<SVGGElement, { animation: Animation; from: number; to: number }>();
      let active = true;
      let shown: PixelMouthState | undefined;
      const opacity = (layer: SVGGElement): string => {
        const running = animations.get(layer);
        const progress = running?.animation.effect?.getComputedTiming().progress;
        return running && typeof progress === 'number'
          ? String(running.from + (running.to - running.from) * progress)
          : shownOpacity.get(layer)!;
      };
      const cancel = () => {
        for (const [layer, { animation }] of animations) {
          const current = opacity(layer);
          shownOpacity.set(layer, current);
          layer.style.opacity = current;
          animation.cancel();
        }
        animations.clear();
      };
      const sync = (force = false) => {
        if (!active) return;
        const moving =
          !still &&
          visible.current &&
          !document.hidden &&
          document.documentElement.dataset['botharnessMotion'] !== 'reduce' &&
          document.documentElement.dataset['botharnessActivity'] !== 'stale';
        const state = moving ? spoken.current : 'saved';
        if (!force && state === shown) return;
        shown = state;
        cancel();
        root.dataset['avatarMouthState'] = state;
        svg?.toggleAttribute('data-avatar-speaking', state !== 'saved');
        for (const layer of layers) {
          const from = shownOpacity.get(layer)!;
          const to = (layer === cover ? state === 'saved' : layer.dataset['avatarMouth'] === state)
            ? '1'
            : '0';
          layer.style.opacity = to;
          shownOpacity.set(layer, to);
          if (moving && from !== to && typeof layer.animate === 'function') {
            const animation = layer.animate([{ opacity: from }, { opacity: to }], {
              duration: 80,
              easing: 'ease-out',
            });
            animations.set(layer, { animation, from: Number(from), to: Number(to) });
            void animation.finished
              .then(() => {
                if (animations.get(layer)?.animation === animation) animations.delete(layer);
              })
              .catch(() => undefined);
          }
        }
      };
      const refresh = () => sync(true);
      const observer =
        typeof IntersectionObserver === 'undefined'
          ? undefined
          : new IntersectionObserver((entries) => {
              if (!active) return;
              const next = entries.some((entry) => entry.isIntersecting);
              if (next === visible.current) return;
              visible.current = next;
              refresh();
            });
      observer?.observe(root);
      const motion = new MutationObserver(refresh);
      motion.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-botharness-motion', 'data-botharness-activity'],
      });
      document.addEventListener('visibilitychange', refresh);
      speak.current = () => sync();
      refresh();
      return () => {
        active = false;
        speak.current = undefined;
        cancel();
        observer?.disconnect();
        motion.disconnect();
        document.removeEventListener('visibilitychange', refresh);
      };
    },
    [markup, still],
  );
  const say = useMountedResource<HTMLSpanElement>(() => speak.current?.(), [mouth]);
  return (
    <>
      <span hidden ref={mount} />
      <span hidden ref={say} />
    </>
  );
}
