import { expect, it } from 'vitest';
import { botRecordStarted, channelDraftStarted } from '../src/host/creation-drafts';

const draft = { hostId: 'A', displayName: '', persona: '', description: '', tags: '' };

it('treats only entered Group names or members as a draft worth asking about', () => {
  expect(channelDraftStarted({ kind: 'draft', hostId: 'A', name: '  ', members: [] })).toBe(false);
  expect(channelDraftStarted({ kind: 'draft', hostId: '', name: 'Team', members: [] })).toBe(true);
  expect(channelDraftStarted({ kind: 'draft', hostId: 'A', name: '', members: ['ada'] })).toBe(
    true,
  );
  expect(
    channelDraftStarted({
      kind: 'submitted',
      hostId: 'A',
      name: 'Team',
      members: ['ada'],
      deviceId: 'phone',
      operationKey: 'key',
    }),
  ).toBe(false);
});

it('treats typed Bot fields or a chosen source as a started draft, but not a bare Environment', () => {
  expect(botRecordStarted({ kind: 'draft', draft })).toBe(false);
  expect(botRecordStarted({ kind: 'draft', draft: { ...draft, displayName: 'Mira' } })).toBe(true);
  expect(botRecordStarted({ kind: 'draft', draft: { ...draft, persona: 'Be brief.' } })).toBe(true);
  expect(botRecordStarted({ kind: 'draft', draft: { ...draft, tagInput: 'travel' } })).toBe(true);
  expect(
    botRecordStarted({ kind: 'draft', draft: { ...draft, source: { kind: 'git', gitUrl: ' ' } } }),
  ).toBe(false);
  expect(
    botRecordStarted({
      kind: 'draft',
      draft: { ...draft, source: { kind: 'git', gitUrl: 'https://github.com/a/b' } },
    }),
  ).toBe(true);
  expect(
    botRecordStarted({
      kind: 'draft',
      draft: {
        ...draft,
        source: {
          kind: 'zip',
          fileId: '12345678-1234-1234-1234-123456789abc',
          fileName: 'Helper.zip',
          sha256: 'a'.repeat(64),
          sizeBytes: 30,
          uploadKey: 'upload-key',
        },
      },
    }),
  ).toBe(true);
});
