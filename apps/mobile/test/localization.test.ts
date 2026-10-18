import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const expo = read('../app.json').expo;
const require = createRequire(import.meta.url);
const { AndroidConfig } = require('expo/config-plugins');

describe('system language', () => {
  it('declares Simplified Chinese, since iOS hands an app only the languages its bundle declares', () => {
    expect(expo.ios.infoPlist.CFBundleLocalizations).toEqual(['en', 'zh-Hans']);
    expect(expo.locales['zh-Hans']).toBe('./locales/zh-Hans.json');
  });

  it('translates every iOS permission prompt the plugins declare', () => {
    const keyFor: Record<string, string> = {
      cameraPermission: 'NSCameraUsageDescription',
      microphonePermission: 'NSMicrophoneUsageDescription',
      photosPermission: 'NSPhotoLibraryUsageDescription',
      speechRecognitionPermission: 'NSSpeechRecognitionUsageDescription',
    };
    const declared = new Set<string>();
    for (const plugin of expo.plugins) {
      if (!Array.isArray(plugin)) continue;
      for (const option of Object.keys(plugin[1])) {
        if (option in keyFor) declared.add(keyFor[option]!);
      }
    }
    const zh = read('../locales/zh-Hans.json').ios;
    expect(Object.keys(zh).sort()).toEqual([...declared].sort());
    for (const text of Object.values(zh)) expect(text).toMatch(/[一-鿿]/u);
  });

  it('does not generate iOS permission keys as Android string translations', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'botharness-mobile-locales-'));
    try {
      mkdirSync(join(projectRoot, 'android/app/src/main/res'), { recursive: true });
      await AndroidConfig.Locales.setLocalesAsync(
        { locales: { 'zh-Hans': read('../locales/zh-Hans.json') } },
        { projectRoot },
      );
      const xml = readFileSync(
        join(projectRoot, 'android/app/src/main/res/values-b+zh+Hans/strings.xml'),
        'utf8',
      );
      expect(xml).not.toMatch(/name="NS\w+UsageDescription"/u);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
