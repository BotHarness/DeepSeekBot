import { expect, it } from 'vitest';
import { creationTags, editCreationTags } from '../src/host/bot-creation-tags';
import {
  createBotCreationController,
  normalizedBlankInput,
  parseCreationRecord,
  type CreationRecord,
} from '../src/host/bot-creation';

const draft = {
  hostId: 'A',
  displayName: 'Tags',
  persona: '',
  description: '',
  tags: 'Existing, 中文',
};

it('turns entered text into distinct trimmed tags and clears only the input', () => {
  expect(editCreationTags({ ...draft, tagInput: 'New' }, { kind: 'add', value: ' New\n' })).toEqual(
    { tags: 'Existing, 中文, New', tagInput: '' },
  );
  expect(editCreationTags(draft, { kind: 'add', value: 'Existing\n' })).toEqual({
    tags: 'Existing, 中文',
    tagInput: '',
  });
  expect(editCreationTags(draft, { kind: 'add', value: ' \n' })).toEqual({
    tags: 'Existing, 中文',
    tagInput: '',
  });
  expect(creationTags(' one, one，中文\nsecond ')).toEqual(['one', '中文', 'second']);
});

it('removes a tag without discarding another tag being composed', () => {
  expect(
    editCreationTags({ ...draft, tagInput: '正在输入' }, { kind: 'remove', value: 'Existing' }),
  ).toEqual({ tags: '中文', tagInput: '正在输入' });
});

it('reads legacy drafts and retains pending text in new drafts and submitted input', () => {
  expect(parseCreationRecord({ kind: 'draft', draft })).toEqual({ kind: 'draft', draft });
  const next = { ...draft, tagInput: ' Pending ' };
  expect(parseCreationRecord({ kind: 'draft', draft: next })).toEqual({
    kind: 'draft',
    draft: next,
  });
  expect(normalizedBlankInput(next).roles).toEqual(['Existing', '中文', 'Pending']);
  expect(() => parseCreationRecord({ kind: 'draft', draft: { ...draft, tagInput: 7 } })).toThrow(
    'storage-invalid',
  );
});

it('retains rapid Enter additions, removals and pending input through controller reload', async () => {
  let saved: CreationRecord | undefined;
  const make = () =>
    createBotCreationController({
      key: () => 'operation-tags-3027',
      storage: {
        read: async () => saved,
        write: async (record) => {
          saved = structuredClone(record);
        },
      },
      port: {
        deviceId: () => 'device-a',
        lookup: async () => null,
        create: async () => {
          throw Error('No mutation expected');
        },
      },
    });
  const c = make();
  await c.edit(draft);
  await Promise.all([
    c.edit((current) => ({
      ...current,
      ...editCreationTags(current, { kind: 'add', value: 'One\n' }),
    })),
    c.edit((current) => ({
      ...current,
      ...editCreationTags(current, { kind: 'add', value: 'Two\n' }),
    })),
    c.edit((current) => ({
      ...current,
      ...editCreationTags(current, { kind: 'remove', value: 'Existing' }),
    })),
    c.edit((current) => ({
      ...current,
      ...editCreationTags(current, { kind: 'input', value: '未完成' }),
    })),
  ]);
  const restored = make();
  await restored.ready;
  expect(restored.getSnapshot().record).toMatchObject({
    kind: 'draft',
    draft: { tags: '中文, One, Two', tagInput: '未完成' },
  });
});
