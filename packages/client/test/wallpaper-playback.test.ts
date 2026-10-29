// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { mountWallpaperPlayback } from '../src/client/wallpaper-playback.js';
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function fixture() {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const video = document.createElement('video');
  video.src = 'blob:accepted';
  const play = vi.spyOn(video, 'play').mockResolvedValue();
  const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});
  const load = vi.spyOn(video, 'load').mockImplementation(() => {});
  const report = vi.fn();
  const dispose = mountWallpaperPlayback(video, report, () => true);
  return { video, play, pause, load, report, dispose };
}
describe('wallpaper playback lifecycle', () => {
  it('stays muted without controls, pauses on blur, resumes on focus and releases listeners/source on disposal', async () => {
    const f = fixture();
    await Promise.resolve();
    expect(f.report).toHaveBeenLastCalledWith({ state: 'playing' });
    expect(f.video.muted).toBe(true);
    expect(f.video.loop).toBe(true);
    expect(f.video.controls).toBe(false);
    window.dispatchEvent(new Event('blur'));
    expect(f.report).toHaveBeenLastCalledWith({ state: 'paused' });
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    expect(f.report).toHaveBeenLastCalledWith({ state: 'playing' });
    f.dispose();
    expect(f.video.hasAttribute('src')).toBe(false);
    const count = f.play.mock.calls.length;
    window.dispatchEvent(new Event('focus'));
    f.video.dispatchEvent(new Event('error'));
    expect(f.play).toHaveBeenCalledTimes(count);
    expect(f.report).toHaveBeenLastCalledWith({ state: 'playing' });
  });
  it('keeps a poster after a real media error and never retries a failed decoder on focus', async () => {
    const f = fixture();
    await Promise.resolve();
    f.video.dispatchEvent(new Event('error'));
    expect(f.video.hidden).toBe(true);
    expect(f.report).toHaveBeenLastCalledWith({
      state: 'poster',
      reason: 'wallpaper-playback-error-0',
    });
    const count = f.play.mock.calls.length;
    window.dispatchEvent(new Event('focus'));
    expect(f.play).toHaveBeenCalledTimes(count);
    f.dispose();
  });
  it('does not report a late play promise after disposal', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const video = document.createElement('video');
    let resolve: () => void = () => {};
    vi.spyOn(video, 'play').mockReturnValue(
      new Promise<void>((r) => {
        resolve = r;
      }),
    );
    vi.spyOn(video, 'pause').mockImplementation(() => {});
    vi.spyOn(video, 'load').mockImplementation(() => {});
    const report = vi.fn();
    const dispose = mountWallpaperPlayback(video, report, () => true);
    dispose();
    resolve();
    await Promise.resolve();
    expect(report).not.toHaveBeenCalled();
  });
});
