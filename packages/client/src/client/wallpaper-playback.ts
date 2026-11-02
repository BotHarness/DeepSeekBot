import type { WallpaperPlayback } from './wallpaper.js';
export function mountWallpaperPlayback(
  video: HTMLVideoElement,
  report: (status: WallpaperPlayback) => void,
  active: () => boolean,
) {
  let disposed = false,
    failed = false,
    focused = document.hasFocus(),
    generation = 0;
  let waiting: ReturnType<typeof setTimeout> | undefined;
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.controls = false;
  video.disablePictureInPicture = true;
  video.tabIndex = -1;
  const fallback = (reason: string) => {
    if (disposed || failed) return;
    failed = true;
    generation++;
    clearTimeout(waiting);
    video.pause();
    video.hidden = true;
    report({ state: 'poster', reason });
  };
  const sync = () => {
    if (disposed || failed) return;
    const current = ++generation;
    if (!active()) {
      video.pause();
      report({ state: 'inactive' });
      return;
    }
    if (document.hidden || !focused) {
      clearTimeout(waiting);
      video.pause();
      report({ state: 'paused' });
      return;
    }
    void video
      .play()
      .then(() => {
        if (disposed || current !== generation) return;
        video.hidden = false;
        report({ state: 'playing' });
      })
      .catch(() => {
        if (current === generation) fallback('wallpaper-autoplay-blocked');
      });
  };
  const focus = () => {
      focused = true;
      sync();
    },
    blur = () => {
      focused = false;
      sync();
    };
  const error = () => fallback(`wallpaper-playback-error-${video.error?.code ?? 0}`);
  const stalled = () => {
    clearTimeout(waiting);
    if (!video.paused) waiting = setTimeout(() => fallback('wallpaper-playback-stalled'), 8000);
  };
  const playing = () => {
    clearTimeout(waiting);
    if (!disposed && !failed) {
      if (document.hidden || !focused || !active()) sync();
      else report({ state: 'playing' });
    }
  };
  const paused = () => {
    if (!disposed && !failed && active() && !document.hidden && focused)
      fallback('wallpaper-playback-interrupted');
  };
  const volume = () => {
    if (!video.muted) video.muted = true;
  };
  video.addEventListener('pause', paused);
  video.addEventListener('error', error);
  video.addEventListener('waiting', stalled);
  video.addEventListener('stalled', stalled);
  video.addEventListener('playing', playing);
  video.addEventListener('volumechange', volume);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('focus', focus);
  window.addEventListener('blur', blur);
  sync();
  return () => {
    disposed = true;
    generation++;
    clearTimeout(waiting);
    document.removeEventListener('visibilitychange', sync);
    window.removeEventListener('focus', focus);
    window.removeEventListener('blur', blur);
    video.removeEventListener('pause', paused);
    video.removeEventListener('error', error);
    video.removeEventListener('waiting', stalled);
    video.removeEventListener('stalled', stalled);
    video.removeEventListener('playing', playing);
    video.removeEventListener('volumechange', volume);
    video.pause();
    video.removeAttribute('src');
    video.load();
  };
}
