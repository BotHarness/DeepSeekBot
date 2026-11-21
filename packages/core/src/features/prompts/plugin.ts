import { join } from 'node:path';

import { promptTextOf } from '../../prompts/prompt-parts.js';
import { createPromptPresetLibrary, promptPartTexts } from '../../prompts/prompt-presets.js';
import { createPromptSettings, type PromptSettings } from '../../prompts/prompt-settings.js';

export function apply({
  dshHome,
  registry,
  ownership,
}: Omit<Parameters<typeof createPromptSettings>[0], 'library'> & { dshHome: string }) {
  return createPromptSettings({
    library: createPromptPresetLibrary(join(dshHome, 'botharness', 'prompt-presets')),
    registry,
    ownership,
  });
}

export function promptText(prompts: PromptSettings, slug: string, sessionId: string | undefined) {
  return sessionId === undefined
    ? promptTextOf(promptPartTexts(prompts.resolved(slug)))
    : prompts.textForSession(sessionId);
}
