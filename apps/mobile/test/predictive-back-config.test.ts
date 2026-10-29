import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import app from '../app.json';

const require = createRequire(import.meta.url);
const { AndroidConfig }: typeof import('expo/config-plugins') = require('expo/config-plugins');

describe('Android predictive back configuration', () => {
  it('enables predictive back callbacks in the generated application manifest', () => {
    const { android } = app.expo;
    const manifest = {
      manifest: {
        $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
        queries: [],
        application: [
          {
            $: {
              'android:name': '.MainApplication',
              'android:enableOnBackInvokedCallback': 'false',
            },
          },
        ],
      },
    } satisfies Parameters<typeof AndroidConfig.PredictiveBackGesture.setPredictiveBackGesture>[1];

    const generated = AndroidConfig.PredictiveBackGesture.setPredictiveBackGesture(
      { android },
      manifest,
    );

    expect(
      AndroidConfig.Manifest.getMainApplicationOrThrow(generated).$[
        'android:enableOnBackInvokedCallback'
      ],
    ).toBe('true');
  });
});
