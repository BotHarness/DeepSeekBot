import Schema from '@deepseek-ai/schemastery';
import type { apply } from './index.js';

export interface BrowserConfig {
  target?: 'local' | 'container' | 'extension' | 'daily-control' | 'profile-control';
  localDriver?: 'current' | 'agent-browser';
  containerDriver?: 'current' | 'agent-browser';
  enabled: boolean;
  browserPath: string;
  headless: boolean;
  idleStopMinutes: number;
  autoAllowActions: boolean;
}

export function createBrowserConfig(): {
  DEFAULT_CONFIG: BrowserConfig;
  Config: Schema<Partial<BrowserConfig>, Parameters<typeof apply>[1]>;
} {
  const DEFAULT_CONFIG: BrowserConfig = {
    target: 'local',
    localDriver: 'current',
    containerDriver: 'current',
    enabled: true,
    browserPath: '',
    headless: false,
    idleStopMinutes: 30,
    autoAllowActions: false,
  };

  const Config: Schema<Partial<BrowserConfig>, Parameters<typeof apply>[1]> = Schema.object({
    target: Schema.union([
      Schema.const('local'),
      Schema.const('container'),
      Schema.const('extension'),
      Schema.const('daily-control'),
      Schema.const('profile-control'),
    ])
      .default('local')
      .volatile(),
    localDriver: Schema.union([Schema.const('current'), Schema.const('agent-browser')])
      .default('current')
      .volatile(),
    containerDriver: Schema.union([Schema.const('current'), Schema.const('agent-browser')])
      .default('current')
      .volatile(),
    enabled: Schema.boolean().default(DEFAULT_CONFIG.enabled).description('启用 Browser'),
    browserPath: Schema.string()
      .default(DEFAULT_CONFIG.browserPath)
      .description('浏览器可执行文件路径；留空自动探测 Chrome / Edge / Chromium'),
    headless: Schema.boolean()
      .default(DEFAULT_CONFIG.headless)
      .description('无窗口运行；默认关闭，Human 需要在窗口里登录一次'),
    idleStopMinutes: Schema.number().default(DEFAULT_CONFIG.idleStopMinutes),
    autoAllowActions: Schema.boolean().default(DEFAULT_CONFIG.autoAllowActions),
  });

  return { DEFAULT_CONFIG, Config };
}
