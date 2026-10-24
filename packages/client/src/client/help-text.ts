import type { HelpText } from '../help-api.js';
import type { BotHarnessTranslate } from './locale.js';
export const helpText = (value: HelpText, t: BotHarnessTranslate): string =>
  t('guide.language') === 'zh' ? (value.zh ?? value.en) : value.en;
