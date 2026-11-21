import type { CdpClient } from './cdp.js';
import type { BrowserModifier } from './keyboard.js';
import type { PreflightDeps } from './provision.js';

export interface BrowserElement {
  readonly ref: string;
  readonly role: string;
  readonly name: string;
  readonly value?: string;
  readonly valueTruncated?: true;
  readonly checked?: boolean | 'mixed';
  readonly disabled?: true;
  readonly readOnly?: true;
  readonly expanded?: boolean;
  readonly selected?: boolean;
}

export interface BrowserObservation {
  readonly url: string;
  readonly title: string;
  readonly elements: readonly BrowserElement[];
  readonly text: string;
}

export interface BrowserTab {
  readonly tabId: string;
  readonly url: string;
  readonly title: string;
}

export interface BotBrowserRuntimeOptions {
  readonly execution?: BrowserExecution;
  readonly browserPath?: string;
  readonly userDataDir: string;
  readonly installDir?: string;
  readonly installFallback?: (
    installDir: string,
    hooks?: { onProgress?: (downloadedBytes: number, totalBytes: number) => void },
  ) => Promise<string>;
  readonly headless?: boolean | (() => boolean);
  readonly foregroundTabs?: () => boolean;
  readonly launchTimeoutMs?: number;
  readonly onEvent?: (detail: string) => void;
  readonly onObservationChanged?: (() => void) | undefined;
  readonly onInstallProgress?: (downloadedBytes: number, totalBytes: number) => void;
  readonly onInstallSettled?: () => void;
  readonly preflight?: PreflightDeps;
  readonly connect?: (url: string) => Promise<CdpClient>;
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
  readonly fileExists?: (path: string) => boolean;
}

export interface BrowserExecution {
  start(): Promise<{ endpoint: string; binary: string }>;
  isRunning(): boolean;
  stop(): Promise<void>;
  viewerUrl?(): string | undefined;
  prepareUpload?(path: string): Promise<{ path: string; dispose(): Promise<void> }>;
}

export interface BotBrowserRuntime {
  runWithSignal?<T>(
    signal: AbortSignal,
    action: () => Promise<T>,
    assertCurrent?: () => void,
  ): Promise<T>;
  ensure(): Promise<void>;
  isRunning(): boolean;
  open(url: string, reuseTabId?: string): Promise<BrowserTab>;
  observe(tabId: string): Promise<BrowserObservation>;
  click(tabId: string, ref: string): Promise<BrowserTab>;
  clickAt(tabId: string, x: number, y: number, button?: 'left' | 'right'): Promise<BrowserTab>;
  type(tabId: string, ref: string, text: string): Promise<BrowserTab>;
  insertText(tabId: string, text: string): Promise<BrowserTab>;
  pressKey(tabId: string, key: string, modifiers?: readonly BrowserModifier[]): Promise<BrowserTab>;
  scroll(tabId: string, direction: 'up' | 'down', amount: number): Promise<BrowserTab>;
  uploadFile(tabId: string, options: { ref?: string; path: string }): Promise<void>;
  createTab(url: string): Promise<BrowserTab>;
  listTabs(): Promise<readonly { targetId: string; url: string; title: string }[]>;
  tabInfo(targetId: string): Promise<{ url: string; title: string }>;
  closeTab(targetId: string): Promise<void>;
  captureScreenshot(tabId: string): Promise<
    | {
        data: string;
        mimeType: string;
        viewport?: { width: number; height: number };
        image?: { width: number; height: number };
      }
    | undefined
  >;
  streamFrames?(
    tabId: string,
    onFrame: (frame: {
      data: string;
      mimeType: string;
      viewport?: { width: number; height: number };
    }) => void,
  ): Promise<() => Promise<void>>;
  openWindow(targetId?: string): Promise<BrowserTab>;
  currentUrl(): string | undefined;
  binaryPath(): string | undefined;
  viewerUrl?(): string | undefined;
  stop(): Promise<void>;
}
