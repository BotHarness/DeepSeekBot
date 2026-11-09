import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  callActivityTone,
  callNotice,
  callToneColor,
  createCallActivity,
  type CallActivityHandle,
  type CallActivityPalette,
  type CallActivityProps,
} from '../src/ui/chat/call-activity';

const moduleRoot = new URL('../modules/local-computer-video/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, moduleRoot), 'utf8');
const kotlin = (name: string) =>
  read(`android/src/main/java/expo/modules/localcomputervideo/${name}.kt`);

const palette: CallActivityPalette = {
  success: '#22c55e',
  accent: '#4176e6',
  warning: '#f59e0b',
  danger: '#ec1313',
  muted: '#61666b',
  surface: '#f5f6f7',
  fg: '#0f1115',
  base: '#fff',
};
const props = (patch: Partial<CallActivityProps> = {}): CallActivityProps => ({
  name: 'Mira',
  phase: 'listening',
  startedAt: 1_700_000_000_000,
  muted: false,
  locale: 'en',
  palette,
  ...patch,
});

describe('Android call notification (#3423)', () => {
  it('shows the call in the words and colours of the in-app bubble', () => {
    expect(callNotice(props(), palette)).toEqual({
      name: 'Mira',
      status: 'Listening',
      tone: 'listening',
      startedAt: 1_700_000_000_000,
      muted: false,
      muteLabel: 'Mute',
      unmuteLabel: 'Unmute',
      hangUpLabel: 'Hang up',
      channelName: 'Bot calls',
      bubbleLabel: 'Back to call with Mira. Listening',
      ringColor: '#22c55e',
      surfaceColor: '#f5f6f7',
      fgColor: '#0f1115',
      baseColor: '#fff',
    });
  });

  it('has no call time before the call connects', () => {
    const notice = callNotice(props({ phase: 'connecting' }), palette);
    expect(notice.startedAt).toBe(0);
    expect(notice.tone).toBe('connecting');
  });

  it('says paused while another call or app has the audio, in Chinese too', () => {
    const notice = callNotice(props({ phase: 'interrupted', locale: 'zh', muted: true }), palette);
    expect(notice.status).toBe('已暂停');
    expect(notice.tone).toBe('paused');
    expect(notice.ringColor).toBe(palette.warning);
    expect(notice.channelName).toBe('Bot 通话');
    expect(notice.muted).toBe(true);
  });

  it('maps every phase to a bubble tone the native side accepts', () => {
    const native = kotlin('CallNotice');
    for (const phase of [
      'connecting',
      'listening',
      'hearing',
      'thinking',
      'speaking',
      'muted',
      'interrupted',
      'reconnecting',
    ] as const)
      expect(native).toContain(`"${callActivityTone(phase)}"`);
    expect(callToneColor(palette, 'ended')).toBe(palette.danger);
  });

  it('updates the notification when only the theme changes', async () => {
    const shown: CallActivityProps[] = [];
    const handle: CallActivityHandle = {
      update: async (next) => void shown.push(next),
      end: async () => undefined,
    };
    const activity = createCallActivity({ start: async () => handle });
    activity.sync(props());
    await Promise.resolve();
    await Promise.resolve();
    activity.sync(props());
    activity.sync(props({ palette: { ...palette, surface: '#353638' } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(shown.map((entry) => entry.palette?.surface)).toEqual(['#353638']);
  });
});

describe('Android background call service (#3423, ADR-0305)', () => {
  it('declares a microphone and media foreground service with its permissions', () => {
    const manifest = read('android/src/main/AndroidManifest.xml');
    for (const permission of [
      'FOREGROUND_SERVICE_MICROPHONE',
      'FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      'POST_NOTIFICATIONS',
      'WAKE_LOCK',
      'SYSTEM_ALERT_WINDOW',
    ])
      expect(manifest).toContain(`android.permission.${permission}`);
    expect(manifest).toContain('android:foregroundServiceType="microphone|mediaPlayback"');
    expect(manifest).not.toContain('phoneCall');
  });

  it('uses the ongoing CallStyle notification with hang up, mute and tap back', () => {
    const service = kotlin('CallService');
    expect(service).toContain('Notification.CallStyle.forOngoingCall(person, hangUp)');
    expect(service).toContain('setUsesChronometer(true)');
    expect(service).toContain('FLAG_NO_CLEAR');
    expect(service).toContain('WIFI_MODE_FULL_LOW_LATENCY');
    expect(service).toContain('PARTIAL_WAKE_LOCK');
  });

  it('keeps the call in the background only while the service holds it', () => {
    const module = kotlin('LocalComputerVideoModule');
    expect(module).toContain('!CallService.keeping && !CallCamera.askingPermission');
    expect(module).not.toContain('FLAG_KEEP_SCREEN_ON');
    expect(module).toContain('intent.action == CallService.ACTION_OPEN');
  });

  it('pauses the uplink and the Bot while another call or app has the audio', () => {
    const attempt = kotlin('CallAttempt');
    expect(attempt).toContain('AudioManager.AUDIOFOCUS_LOSS_TRANSIENT');
    expect(attempt).toContain('addOnModeChangedListener');
    expect(attempt).toContain('peer?.setAudioPlayout(!interrupted)');
  });
});

describe('Android call bubble over other apps (#3469)', () => {
  it('draws an overlay window that never shows while an app activity is started', () => {
    const overlay = kotlin('CallOverlay');
    expect(overlay).toContain('TYPE_APPLICATION_OVERLAY');
    const module = kotlin('LocalComputerVideoModule');
    expect(module).toContain('onActivityStarted');
    expect(module).toContain('CallService.setOverlay(false)');
    expect(kotlin('CallService')).toContain('Settings.canDrawOverlays(this)');
  });
});
