import { expect, it } from 'vitest';
import { TOB_CLI_PROMPT } from '../src/tob/service.js';

it('uses one short management instruction', () => {
  expect(TOB_CLI_PROMPT).toBe(
    'For problems with the App, run deepseekbot capabilities and doctor first and use the CLI yourself.',
  );
});
