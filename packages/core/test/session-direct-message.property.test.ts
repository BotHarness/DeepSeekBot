import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  sessionDirectBody,
  sessionDirectPrompt,
  sessionDirectSpeaker,
} from '../src/runtime/session-direct-message.js';

const HEADER = '[Human wrote this directly in your Session detail; no Channel shows it]';
const fragment = fc.oneof(
  fc.string({ maxLength: 20 }),
  fc.constantFrom(
    HEADER,
    `${HEADER}\n`,
    '\n[Source Event ID: ',
    '[Host: note]\n\n',
    '\n- bash (call c1): ls ]',
    ']',
    '\n',
  ),
);
const body = fc.array(fragment, { maxLength: 8 }).map((parts) => parts.join(''));
const id = fc.stringMatching(/^[A-Za-z0-9._:-]{1,24}$/u);
const hostNote = fc
  .tuple(
    fc.stringMatching(/^[^\n]{0,30}$/u),
    fc.array(fc.stringMatching(/^[^\n]{0,30}$/u), { maxLength: 3 }),
  )
  .map(([head, bullets]) => `[Host${head}${bullets.map((line) => `\n- ${line}`).join('')}]\n\n`);
const speaker = fc
  .tuple(fc.stringMatching(/^[^[\]\n]{1,20}$/u), fc.boolean())
  .map(
    ([name, policies]) =>
      `[${name}]\n` +
      (policies ? '[Speaker policies: latest revision wins; Deny wins]\n[{"roleId":"r"}]\n' : ''),
  );

describe('Session detail direct message format', () => {
  it('gives back the exact body for any body and Source Event id', () => {
    fc.assert(
      fc.property(body, id, (text, sourceEventId) => {
        expect(sessionDirectBody(sessionDirectPrompt(text, sourceEventId))).toBe(text);
      }),
    );
  });

  it('gives back the body after Host notes and a speaker envelope', () => {
    fc.assert(
      fc.property(
        fc.array(hostNote, { maxLength: 3 }),
        speaker,
        body,
        id,
        (notes, envelope, text, sourceEventId) => {
          const prompt = sessionDirectSpeaker(sessionDirectPrompt(text, sourceEventId), envelope);
          expect(prompt).toBeDefined();
          expect(sessionDirectBody(notes.join('') + prompt)).toBe(text);
        },
      ),
    );
  });

  it('rejects text before the header that is not a Host note or speaker line', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), body, id, (before, text, sourceEventId) => {
        expect(
          sessionDirectBody(`x${before}\n${sessionDirectPrompt(text, sourceEventId)}`),
        ).toBeUndefined();
      }),
    );
  });
});
