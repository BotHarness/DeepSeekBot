import fc from 'fast-check';
import { expect, it } from 'vitest';

import { sniffAttachmentMime } from '../src/attachments/store.js';

it('recognizes every nonempty byte prefix of UTF-8 text without binary controls', () => {
  fc.assert(
    fc.property(fc.string({ unit: 'binary', maxLength: 32 }), (text) => {
      const bytes = Buffer.from('Text: ' + text.replace(/[\u0000-\u001f]/gu, ' '));
      for (let end = 1; end <= bytes.length; end++) {
        expect(sniffAttachmentMime(bytes.subarray(0, end), bytes.length)).toBe('text/plain');
      }
    }),
    { examples: [['界🌏']] },
  );
});
