// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(async () => {
  const { createRequire, Module } = await import('node:module');
  const { readdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  const local = createRequire(import.meta.url);
  for (const folder of ['button', 'row-icons'])
    for (const name of readdirSync(dirname(local.resolve(`../assets/${folder}/check.xml`)))) {
      const path = local.resolve(`../assets/${folder}/${name}`);
      const asset = new Module(path);
      asset.exports = name;
      local.cache[path] = asset;
    }
});

vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('@expo/ui/jetpack-compose', async () => (await import('./compose-card-shim')).compose);
vi.mock(
  '@expo/ui/jetpack-compose/modifiers',
  async () => (await import('./compose-card-shim')).modifiers,
);
vi.mock('../src/ui/primitives/button', () => import('../src/ui/primitives/button.android'));
vi.mock(
  '../src/ui/primitives/loading-indicator',
  () => import('../src/ui/primitives/loading-indicator.android'),
);
vi.mock('../src/ui/chat/action-card', () => import('../src/ui/chat/action-card.android'));
vi.mock('../src/ui/design/theme', async () => {
  const { theme } = await import('./compose-card-shim');
  return { useDesignTheme: () => theme };
});

import type { QuestionItem } from '../src/host/wire';
import { emptyDraft } from '../src/host/requests';
import {
  ActionCard,
  CardButtons,
  CardField,
  CardNote,
  CardPreview,
  DetailRow,
} from '../src/ui/chat/action-card.android';
import { FileDiff } from '../src/ui/chat/approval-diff.android';
import { QuestionFields } from '../src/ui/chat/question-fields.android';
import { Button } from '../src/ui/primitives/button.android';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Modifier = Record<string, unknown>;

let root: Root | undefined;
afterEach(() => act(() => root?.unmount()));
async function mount(node: ReactNode) {
  const host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}
function modifiers(element: Element | null): Modifier[] {
  return JSON.parse(element?.getAttribute('data-modifiers') ?? '[]') as Modifier[];
}
const all = (view: Element, name: string) => [...view.querySelectorAll(`[data-compose="${name}"]`)];
const texts = (view: Element) => all(view, 'Text').map((text) => text.textContent);

describe('ActionCard on Android', () => {
  it('is one Material 3 card in one Host, with its buttons drawn in the same Compose tree', async () => {
    const allow = vi.fn();
    const view = await mount(
      <ActionCard
        category="Terminal"
        status="Needs you"
        title="Run this command"
        preview={<CardPreview text="git status" mono maxLines={2} />}
      >
        <CardNote>Runs in the workspace.</CardNote>
        <CardButtons stack>
          <Button label="Allow once" tone="primary" symbol="check" onPress={allow} />
          <Button label="Deny" tone="danger" symbol="x" onPress={() => {}} />
        </CardButtons>
      </ActionCard>,
    );
    expect(all(view, 'Host')).toHaveLength(1);
    expect(all(view, 'RNHostView')).toHaveLength(0);
    const card = all(view, 'Card')[0]!;
    expect(card.getAttribute('data-border')).toBeNull();
    expect(card.getAttribute('data-colors')).toBeNull();
    expect(modifiers(card)).toContainEqual({ testID: 'action-card' });
    expect(texts(card)).toEqual(
      expect.arrayContaining(['Terminal', 'Needs you', 'Run this command', 'git status']),
    );
    const preview = all(card, 'Text').find((text) => text.textContent === 'git status')!;
    expect(preview.getAttribute('data-maxlines')).toBe('2');
    expect(JSON.parse(preview.getAttribute('data-style')!)).toMatchObject({
      fontFamily: 'monospace',
    });
    const [primary, deny] = [all(card, 'FilledButton')[0]!, all(card, 'FilledButton')[1]!];
    expect(primary.textContent).toBe('Allow once');
    expect(modifiers(primary)).toContainEqual({ fillMaxWidth: true });
    expect(JSON.parse(deny.getAttribute('data-colors')!)).toEqual({
      containerColor: 'role:error',
      contentColor: 'role:onError',
    });
    await act(async () => (primary as HTMLElement).click());
    expect(allow).toHaveBeenCalledOnce();
  });

  it('sizes a row of two decisions to their labels and outlines the focused card', async () => {
    const view = await mount(
      <ActionCard category="Tool" title="Recover" focused>
        <CardButtons>
          <Button label="Compact" onPress={() => {}} />
          <Button label="New session" onPress={() => {}} />
        </CardButtons>
      </ActionCard>,
    );
    expect(all(view, 'FlowRow').length).toBeGreaterThan(1);
    for (const button of all(view, 'FilledTonalButton'))
      expect(modifiers(button)).not.toContainEqual({ fillMaxWidth: true });
    expect(JSON.parse(all(view, 'Card')[0]!.getAttribute('data-border')!)).toEqual({
      width: 2,
      color: 'accent',
    });
  });

  it('opens Details in place and shows each argument', async () => {
    const view = await mount(
      <ActionCard
        category="Terminal"
        title="Run this command"
        details={<DetailRow label={t.workingFolder} value="/srv/app" />}
      />,
    );
    expect(texts(view)).not.toContain('/srv/app');
    const toggle = all(view, 'TextButton')[0]!;
    expect(toggle.textContent).toBe(t.details);
    expect(all(toggle, 'Icon')[0]!.getAttribute('data-source')).toBe('expand.xml');
    await act(async () => (toggle as HTMLElement).click());
    expect(texts(view)).toEqual(expect.arrayContaining([t.workingFolder, '/srv/app']));
    expect(all(toggle, 'Icon')[0]!.getAttribute('data-source')).toBe('collapse.xml');
  });

  it('shows the native loading indicator inside the card while loading, and the error', async () => {
    const view = await mount(
      <ActionCard category="Tool" title="Run" busy error="Could not load">
        <Button label="Try again" onPress={() => {}} />
      </ActionCard>,
    );
    expect(all(view, 'Host')).toHaveLength(1);
    expect(all(view, 'LoadingIndicator')).toHaveLength(1);
    expect(all(view, 'FilledTonalButton')).toHaveLength(0);
    const error = all(view, 'Text').find((text) => text.textContent === 'Could not load')!;
    expect(error.getAttribute('data-color')).toBe('role:error');
  });

  it('types into a native filled field with a floating label', async () => {
    const change = vi.fn();
    const view = await mount(
      <CardField label="Reply" testID="reply" value="" onChangeText={change} />,
    );
    const field = view.querySelector('textarea')!;
    expect(modifiers(field)).toEqual(
      expect.arrayContaining([{ semantics: { contentDescription: 'Reply' } }, { testID: 'reply' }]),
    );
    expect(all(view, 'slot:label')[0]!.textContent).toBe('Reply');
    expect(all(view, 'slot:placeholder')).toHaveLength(0);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(field, 'On it');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(change).toHaveBeenCalledWith('On it');
  });
});

describe('question options on Android', () => {
  const question: QuestionItem = {
    id: 'q1',
    question: 'Which branch?',
    options: [{ label: 'main', description: 'The default branch' }, { label: 'dev' }],
  };

  it('answers a single choice from a native radio row', async () => {
    const pick = vi.fn();
    const view = await mount(
      <QuestionFields
        question={question}
        draft={emptyDraft()}
        heading={false}
        disabled={false}
        inChat={false}
        onChange={() => {}}
        onPick={pick}
      />,
    );
    expect(all(view, 'RadioButton')).toHaveLength(2);
    expect(all(view, 'Checkbox')).toHaveLength(0);
    const rows = all(view, 'Row');
    expect(texts(rows[0]!)).toEqual([t.option('A', 'main'), 'The default branch']);
    expect(modifiers(rows[1]!)).toContainEqual({
      toggleable: { value: false, role: 'radioButton', enabled: true },
    });
    await act(async () => (rows[1] as HTMLElement).click());
    expect(pick).toHaveBeenCalledWith('dev');
    expect(view.querySelector('textarea')).not.toBeNull();
  });

  it('toggles multiple choices with native checkboxes and locks them while busy', async () => {
    const change = vi.fn();
    const multiple = { ...question, multiSelect: true };
    const draft = { ...emptyDraft(), selected: ['main'] };
    const view = await mount(
      <QuestionFields
        question={multiple}
        draft={draft}
        heading
        disabled={false}
        inChat
        onChange={change}
      />,
    );
    expect(all(view, 'Checkbox').map((box) => box.getAttribute('data-value'))).toEqual([
      'true',
      'false',
    ]);
    expect(texts(view)).toEqual(expect.arrayContaining(['Which branch?', t.replyInChat]));
    expect(view.querySelector('textarea')).toBeNull();
    await act(async () => (all(view, 'Row')[1] as HTMLElement).click());
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ selected: ['main', 'dev'] }));

    change.mockClear();
    await act(async () =>
      root!.render(
        <QuestionFields
          question={multiple}
          draft={draft}
          heading
          disabled
          inChat
          onChange={change}
        />,
      ),
    );
    await act(async () => (all(view, 'Row')[1] as HTMLElement).click());
    expect(change).not.toHaveBeenCalled();
  });

  it('opens the full editor from a native field when the chat expands input', async () => {
    const expand = vi.fn();
    const view = await mount(
      <QuestionFields
        question={question}
        draft={emptyDraft()}
        heading={false}
        disabled={false}
        inChat={false}
        onExpand={expand}
        onChange={() => {}}
      />,
    );
    const field = all(view, 'Box')[0]!;
    expect(modifiers(field)).toContainEqual({
      semantics: { contentDescription: `${t.otherAnswer}: Which branch?` },
    });
    await act(async () => (field as HTMLElement).click());
    expect(expand).toHaveBeenCalledOnce();
  });
});

it('draws an approval diff in Compose and shows the rest on demand', async () => {
  const lines = Array.from({ length: 45 }, (_, index) => ({
    kind: index === 0 ? ('add' as const) : ('context' as const),
    text: `line ${index}`,
  }));
  const view = await mount(<FileDiff change={{ path: 'a.ts', added: 1, removed: 0, lines }} />);
  const diff = all(view, 'Column').find((column) =>
    modifiers(column).some(
      (modifier) => 'testID' in modifier && modifier['testID'] === 'approval-diff',
    ),
  )!;
  expect(all(diff, 'Text')).toHaveLength(40);
  expect(all(diff, 'Text')[0]!.getAttribute('data-color')).toBe('success');
  const more = all(view, 'TextButton')[0]!;
  expect(more.textContent).toBe(t.diffMore(5));
  await act(async () => (more as HTMLElement).click());
  expect(all(diff, 'Text')).toHaveLength(45);
});
