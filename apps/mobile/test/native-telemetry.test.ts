import { afterEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  physical: true,
  platform: 'ios',
  version: '2.0.0',
  build: '42',
}));
const wire = vi.hoisted(() => ({ send: vi.fn(async () => {}), clear: vi.fn(async () => {}) }));
vi.mock('expo-device', () => ({
  get isDevice() {
    return native.physical;
  },
}));
vi.mock('expo-application', () => ({
  get nativeApplicationVersion() {
    return native.version;
  },
  get nativeBuildVersion() {
    return native.build;
  },
}));
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0', ios: { buildNumber: '1' } } },
}));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return native.platform;
    },
  },
}));
vi.mock('../src/ui/strings', () => ({ locale: 'en' }));
vi.mock('../src/telemetry/posthog-sender', () => ({ createPostHogSender: () => wire }));
vi.mock('expo-file-system', () => ({
  Paths: { document: 'test' },
  File: class {
    exists = false;
    create() {
      this.exists = true;
    }
    write() {}
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.resetModules();
});

it.each([
  ['ios', true, false, 'production', 'true', '', true],
  ['android', true, false, 'production', 'true', '', true],
  ['ios', false, false, 'production', 'true', '', false],
  ['ios', true, true, 'production', 'true', '', false],
  ['ios', true, false, 'production', '', '', false],
  ['ios', true, false, '', 'true', '', false],
  ['web', true, false, 'production', 'true', '', false],
  ['ios', false, true, 'qa', '', '11111111-1111-4111-8111-111111111111', true],
  ['web', true, true, 'qa', '', '11111111-1111-4111-8111-111111111111', false],
] as const)(
  'gates native sends for %s physical=%s dev=%s mode=%s qualified=%s qa=%s',
  async (platform, physical, dev, mode, qualified, qa, sends) => {
    native.platform = platform;
    native.physical = physical;
    vi.stubGlobal('__DEV__', dev);
    vi.stubEnv('EXPO_PUBLIC_MOBILE_TELEMETRY', mode);
    vi.stubEnv('EXPO_PUBLIC_MOBILE_POSTHOG_TOKEN', 'phc_test');
    vi.stubEnv('EXPO_PUBLIC_MOBILE_TELEMETRY_QUALIFIED', qualified);
    vi.stubEnv('EXPO_PUBLIC_MOBILE_TELEMETRY_QA_RUN', qa);
    const { mobileTelemetry } = await import('../src/telemetry/native');
    try {
      await mobileTelemetry.ready;
      mobileTelemetry.foreground(true, 0);
      await mobileTelemetry.flush();
      expect(wire.send).toHaveBeenCalledTimes(sends ? 1 : 0);
      if (sends)
        expect(wire.send).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              properties: expect.objectContaining({
                app_version: '2.0.0',
                app_build: '42',
                platform,
              }),
            }),
          ],
          expect.any(AbortSignal),
        );
    } finally {
      mobileTelemetry.dispose();
    }
  },
);
