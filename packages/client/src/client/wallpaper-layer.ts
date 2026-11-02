import { mountWallpaperPlayback } from './wallpaper-playback.js';
import type { Wallpaper } from './wallpaper.js';
import { wallpaperPlacement } from './wallpaper-store.js';
export function mountWallpaper(owner: Wallpaper): () => void {
  const layer = document.createElement('div');
  layer.dataset.bhWallpaper = '';
  layer.setAttribute('aria-hidden', 'true');
  const image = document.createElement('img');
  image.alt = '';
  image.draggable = false;
  layer.append(image);
  let video: HTMLVideoElement | undefined;
  let offVideo: (() => void) | undefined;
  let mediaUrl: string | undefined;
  const stopVideo = () => {
    offVideo?.();
    offVideo = undefined;
    video?.remove();
    video = undefined;
    mediaUrl = undefined;
  };
  let frame: HTMLElement | undefined;
  const style = document.createElement('style');
  style.dataset.plugin = '@botharness/ui';
  style.dataset.pluginCss = '@botharness/ui/wallpaper';
  style.textContent = `
:root .bh-workspace-mount[data-workspace-enabled][data-wallpaper-active] { position:relative; isolation:isolate; }
:root [data-bh-wallpaper] { position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:-1; }
:root [data-bh-wallpaper] img, :root [data-bh-wallpaper] video { position:absolute; max-width:none; max-height:none; }
:root .bh-workspace-mount[data-wallpaper-active] .bh-dock[data-workspace-dock],
:root .bh-workspace-mount[data-wallpaper-active] .bh-dock[data-workspace-dock] .dv-dockview,
:root .bh-workspace-mount[data-wallpaper-active] .bh-channel-session-divider,
:root .bh-workspace-mount[data-wallpaper-active] .bh-message-member-divider { background:transparent; }
:root .bh-workspace-mount[data-workspace-enabled][data-wallpaper-active] .bh-dock[data-workspace-dock] .bh-dock-theme .dv-groupview :is(.dv-tabs-and-actions-container, .bh-channel-session-header) { border-bottom-color:transparent; background-clip:padding-box; }
:root[data-platform="darwin"]:not([data-fullscreen]) .bh-workspace-mount[data-workspace-enabled][data-wallpaper-active] > .bh-workspace-chrome { background:transparent; backdrop-filter:none; }
`;
  document.head.append(style);
  const resize = new ResizeObserver(() => paint());
  const paint = () => {
    const current = owner.getSnapshot().current;
    const next = current
      ? (document.querySelector<HTMLElement>('.bh-workspace-mount[data-workspace-enabled]') ??
        undefined)
      : undefined;
    if (frame !== next) {
      frame?.removeAttribute('data-wallpaper-active');
      resize.disconnect();
      layer.remove();
      frame = next;
      if (frame) {
        frame.setAttribute('data-wallpaper-active', '');
        frame.prepend(layer);
        resize.observe(layer);
      }
    }
    if (!frame || !current) {
      stopVideo();
      owner.setPlayback({ state: 'inactive' });
      return;
    }
    const backdrop = current.kind === 'video' ? current.posterUrl : current.url;
    if (backdrop && image.src !== backdrop) image.src = backdrop;
    if (mediaUrl !== current.url) {
      stopVideo();
      mediaUrl = current.url;
      if (current.kind === 'video') {
        if (current.fallbackReason)
          owner.setPlayback({ state: 'poster', reason: current.fallbackReason });
        else {
          video = document.createElement('video');
          video.setAttribute('aria-hidden', 'true');
          video.src = current.url;
          video.poster = current.posterUrl ?? '';
          layer.append(video);
          offVideo = mountWallpaperPlayback(
            video,
            (status) => owner.setPlayback(status),
            () => Boolean(frame),
          );
        }
      }
    }
    const box = getComputedStyle(layer);
    const placement = wallpaperPlacement(
      current.width,
      current.height,
      Number.parseFloat(box.width),
      Number.parseFloat(box.height),
      current.crop,
    );
    for (const [key, value] of Object.entries(placement))
      for (const surface of [image, video]) surface?.style.setProperty(key, `${value}px`);
  };
  const observer = new MutationObserver(paint);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-workspace-enabled'],
  });
  const off = owner.subscribe(paint);
  const channel =
    typeof BroadcastChannel === 'function'
      ? new BroadcastChannel('botharness-wallpaper')
      : undefined;
  let revision = owner.getSnapshot().revision;
  const broadcast = owner.subscribe(() => {
    const next = owner.getSnapshot().revision;
    if (next !== revision) {
      revision = next;
      channel?.postMessage({ changed: true });
    }
  });
  const refresh = () => {
    void owner.refresh().catch(() => {});
  };
  if (channel) channel.onmessage = refresh;
  window.addEventListener('focus', refresh);
  refresh();
  paint();
  return () => {
    off();
    stopVideo();
    broadcast();
    observer.disconnect();
    resize.disconnect();
    window.removeEventListener('focus', refresh);
    channel?.close();
    frame?.removeAttribute('data-wallpaper-active');
    layer.remove();
    style.remove();
    owner.dispose();
  };
}
