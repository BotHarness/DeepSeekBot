import { WallpaperError, VIDEO_LIMIT } from './wallpaper-store.js';
import type { WallpaperPreview } from './wallpaper.js';
export async function decodeVideoWallpaper(blob: Blob): Promise<WallpaperPreview> {
  if (!blob.size || blob.size > VIDEO_LIMIT) throw new WallpaperError('wallpaper-size-invalid');
  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const url = URL.createObjectURL(blob);
  let posterUrl: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        video.onerror = () => reject(new WallpaperError('wallpaper-video-decode-failed'));
        video.ontimeupdate = () => {
          if (video.currentTime > 0 && video.readyState >= 2) resolve();
        };
        video.src = url;
        void video
          .play()
          .catch(() => reject(new WallpaperError('wallpaper-video-playback-blocked')));
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new WallpaperError('wallpaper-video-decode-failed')), 6000);
      }),
    ]);
    video.pause();
    if (
      !video.videoWidth ||
      !video.videoHeight ||
      !Number.isFinite(video.duration) ||
      video.duration <= 0
    )
      throw new WallpaperError('wallpaper-video-decode-failed');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new WallpaperError('wallpaper-poster-unavailable');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const poster = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new WallpaperError('wallpaper-poster-unavailable')),
        'image/png',
      ),
    );
    posterUrl = URL.createObjectURL(poster);
    return {
      kind: 'video',
      blob,
      url,
      width: video.videoWidth,
      height: video.videoHeight,
      poster,
      posterUrl,
      release: () => {
        URL.revokeObjectURL(url);
        if (posterUrl) URL.revokeObjectURL(posterUrl);
      },
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    if (posterUrl) URL.revokeObjectURL(posterUrl);
    if (error instanceof WallpaperError) throw error;
    throw new WallpaperError('wallpaper-video-decode-failed');
  } finally {
    clearTimeout(timer);
    video.onerror = null;
    video.ontimeupdate = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}
