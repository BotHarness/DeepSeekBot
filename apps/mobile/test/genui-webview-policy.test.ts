import { expect, it } from 'vitest';

import { genuiWebViewPolicy } from '../src/genui/webview-policy';

it('passes data detector types as a list, which the native WebView props parser requires', () => {
  expect(genuiWebViewPolicy.dataDetectorTypes).toEqual(['none']);
});

it('never scrolls inside the bubble, so a vertical drag scrolls the conversation instead', () => {
  expect(genuiWebViewPolicy).toMatchObject({ scrollEnabled: false, nestedScrollEnabled: false });
});

it('keeps the GenUI WebView isolated from storage, files, windows and links', () => {
  expect(genuiWebViewPolicy).toMatchObject({
    javaScriptCanOpenWindowsAutomatically: false,
    setSupportMultipleWindows: false,
    domStorageEnabled: false,
    cacheEnabled: false,
    incognito: true,
    allowFileAccess: false,
    allowFileAccessFromFileURLs: false,
    allowUniversalAccessFromFileURLs: false,
    allowsLinkPreview: false,
  });
});
