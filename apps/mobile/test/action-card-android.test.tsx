// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
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

vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
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
vi.mock('../src/ui/chat/approval-diff', () => import('../src/ui/chat/approval-diff.android'));
vi.mock('../src/ui/design/theme', async () => {
  const { resolveTheme } = await import('../src/ui/design/resolve-theme');
  return { useDesignTheme: () => resolveTheme('light', {}, 'android') };
});

import type { QuestionItem } from '@botharness/host-protocol/wire';
import type { ApprovalRequest } from '@botharness/host-client/requests';
import type { ApprovalCardPort } from '../src/ui/chat/approval-card';
import { emptyDraft } from '@botharness/host-client/requests';
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
import { cardChoiceColors } from '../src/ui/design/controls';
import { resolveTheme } from '../src/ui/design/resolve-theme';
import { radius } from '../src/ui/design/tokens';
import { t } from '../src/ui/strings';

const theme = resolveTheme('light', {}, 'android');
const { ApprovalCard } = await import('../src/ui/chat/approval-card');

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

function expectCapsule(control: HTMLButtonElement, rest: string, pressed = rest) {
  for (const [state, fill] of [
    ['rest', rest],
    ['pressed', pressed],
  ]) {
    const style = JSON.parse(control.getAttribute(`data-${state}-style`) ?? '{}');
    expect(style).toMatchObject({
      minHeight: theme.touch,
      minWidth: theme.touch,
      borderRadius: radius.round,
      backgroundColor: fill,
    });
    expect(Object.keys(style).filter((name) => /^(border|outline)/.test(name))).toEqual([
      'borderRadius',
    ]);
  }
}

function expectOption(control: HTMLButtonElement, rest: string, pressed = rest) {
  for (const [state, fill] of [
    ['rest', rest],
    ['pressed', pressed],
  ]) {
    const style = JSON.parse(control.getAttribute(`data-${state}-style`) ?? '{}');
    expect(style).toMatchObject({
      minHeight: theme.touch,
      minWidth: theme.touch,
      backgroundColor: fill,
    });
  }
}

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
    expect(JSON.parse(card.getAttribute('data-colors')!)).toEqual({
      containerColor: theme.layer.raised.fill,
      contentColor: theme.color.fg,
    });
    expect(
      all(card, 'Text')
        .find((text) => text.textContent === 'Needs you')
        ?.getAttribute('data-color'),
    ).toBe(theme.color.warning);
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
      color: theme.color.accent,
    });
  });

  it('stacks three or more decisions full width, looking through fragments', async () => {
    const view = await mount(
      <ActionCard category="Run failed" title="Details">
        <CardButtons>
          <Button label="Continue" tone="primary" onPress={() => {}} />
          <>
            <Button label="Compact" onPress={() => {}} />
            <Button label="New session" onPress={() => {}} />
          </>
          {null}
          <Button label="Report" onPress={() => {}} />
        </CardButtons>
      </ActionCard>,
    );
    expect(all(view, 'FlowRow')).toHaveLength(1);
    for (const button of all(view, 'FilledTonalButton'))
      expect(modifiers(button)).toContainEqual({ fillMaxWidth: true });
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

  it('answers a single choice from a React Native radio pressable', async () => {
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
    const rows = [...view.querySelectorAll<HTMLButtonElement>('button[role="radio"]')];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.parentElement).toBe(view.querySelector('[data-testid="question-options"]'));
    expect(rows[1]!.parentElement).toBe(rows[0]!.parentElement);
    expect(rows[0]!.closest('[data-compose="RNHostView"]')).not.toBeNull();
    expect(rows[0]!.getAttribute('aria-label')).toBe(t.option('A', 'main'));
    expect(rows[0]!.textContent).toContain('The default branch');
    expect(rows[1]!.getAttribute('aria-checked')).toBe('false');
    expectOption(
      rows[0]!,
      cardChoiceColors(theme, 'secondary').fill,
      cardChoiceColors(theme, 'secondary', 'pressed').fill,
    );
    await act(async () => rows[1]!.click());
    expect(pick).toHaveBeenCalledWith('dev');
    expect(view.querySelector('textarea')).not.toBeNull();
  });

  it('toggles multiple choices with checkbox pressables and locks them while busy', async () => {
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
    const checkboxes = [...view.querySelectorAll<HTMLButtonElement>('button[role="checkbox"]')];
    expect(checkboxes.map((checkbox) => checkbox.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
    ]);
    expect(checkboxes[0]!.querySelector('[data-testid="question-option-check"]')).not.toBeNull();
    expect(checkboxes[1]!.querySelector('[data-testid="question-option-check"]')).toBeNull();
    expectOption(
      checkboxes[0]!,
      cardChoiceColors(theme, 'primary').fill,
      cardChoiceColors(theme, 'primary', 'pressed').fill,
    );
    expect(texts(view)).toEqual(expect.arrayContaining(['Which branch?', t.replyInChat]));
    expect(view.querySelector('textarea')).toBeNull();
    await act(async () => checkboxes[1]!.click());
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
    expect(checkboxes.every((checkbox) => checkbox.disabled)).toBe(true);
    expectOption(checkboxes[0]!, cardChoiceColors(theme, 'primary').fill);
    expectOption(checkboxes[1]!, cardChoiceColors(theme, 'secondary', 'disabled').fill);
    await act(async () => checkboxes[1]!.click());
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
  expect(all(diff, 'Text')[0]!.getAttribute('data-color')).toBe(theme.color.success);
  const more = all(view, 'TextButton')[0]!;
  expect(more.textContent).toBe(t.diffMore(5));
  await act(async () => (more as HTMLElement).click());
  expect(all(diff, 'Text')).toHaveLength(45);
});

it.each(['allowed-once', 'allowed-always-tool', 'rejected'] as const)(
  'keeps %s approval results with a locked, selected pressable',
  async (outcome) => {
    const request: ApprovalRequest = {
      channelId: 'dm-qa',
      messageId: 'qa-request',
      botSlug: 'qa',
      toolName: 'bot_send_message',
      role: 'orchestrator',
      cwd: '/qa/workspace',
      input: JSON.stringify({ body: 'QA approval body' }),
      allowAlways: true,
      status: 'pending',
    };
    const port: ApprovalCardPort = { load: async () => request, decide: async () => 'accepted' };
    const decide = vi.spyOn(port, 'decide');
    const view = await mount(<ApprovalCard port={port} subject="bot_send_message" />);
    const detail = all(view, 'TextButton').find((node) =>
      modifiers(node).some((modifier) => modifier.testID === 'action-card-details'),
    );
    if (!(detail instanceof HTMLElement)) throw new Error('Details missing');
    await act(async () => detail.click());
    const chosenID =
      outcome === 'allowed-once'
        ? 'approval-allow-once'
        : outcome === 'allowed-always-tool'
          ? 'approval-always-allow'
          : 'approval-deny';
    const decisions = [
      ['approval-allow-once', 'primary', t.allowOnce],
      ['approval-always-allow', 'secondary', t.alwaysAllow],
      ['approval-deny', 'danger', t.reject],
    ] as const;
    const controls = decisions.map(([id, tone, label]) => ({
      id,
      tone,
      label,
      control: view.querySelector<HTMLButtonElement>(`button[data-testid="${id}"]`)!,
    }));
    for (const { control, tone, label } of controls) {
      expect(control.getAttribute('role')).toBe('button');
      expect(control.getAttribute('aria-label')).toBe(label);
      expect(control.closest('[data-compose="RNHostView"]')).not.toBeNull();
      expectCapsule(
        control,
        cardChoiceColors(theme, tone).fill,
        cardChoiceColors(theme, tone, 'pressed').fill,
      );
    }
    const chosen = controls.find(({ id }) => id === chosenID)!.control;
    await act(async () => chosen.click());
    expect(decide).toHaveBeenCalledExactlyOnceWith(outcome);
    expect(texts(view)).toContain('/qa/workspace');
    const result = all(view, 'Text').find((node) =>
      modifiers(node).some((modifier) => modifier.testID === 'approval-result'),
    );
    expect(result).toBeDefined();
    expect(result?.parentElement?.getAttribute('data-compose')).toBe('Column');
    expect(chosen.textContent).toContain(t.selectedChoice);
    for (const { control, tone } of controls) {
      expect(control.disabled).toBe(true);
      expect(control.getAttribute('aria-selected')).toBe(String(control === chosen));
      expectCapsule(
        control,
        cardChoiceColors(theme, tone, control === chosen ? 'selected-disabled' : 'disabled').fill,
      );
    }
    await act(async () => chosen.click());
    expect(decide).toHaveBeenCalledOnce();
  },
);
