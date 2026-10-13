// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { MessagingGrant, MessagingSnapshot } from '../../core/src/messaging/outbound.js';
import type { BridgeActions } from '../src/client/actions.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => createElement('button', props),
  Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
  SegmentedTabs: ({
    items,
    value,
    onChange,
  }: {
    items: { value: string; label: ReactNode }[];
    value: string;
    onChange(value: string): void;
  }) =>
    createElement(
      'div',
      { role: 'tablist' },
      items.map((item) =>
        createElement(
          'button',
          {
            key: item.value,
            role: 'tab',
            'aria-selected': item.value === value,
            onClick: () => onChange(item.value),
          },
          item.label,
        ),
      ),
    ),
  IconChevronRightOutlineRegular: () => null,
  IconInfoOutlineRegular: () => null,
  Tooltip: ({ children, label }: PropsWithChildren<{ label: string }>) =>
    createElement('span', { title: label }, children),
  Switch: () => null,
  Checkbox: ({
    checked,
    label,
    onChange,
  }: {
    checked: boolean;
    label: string;
    onChange(value: boolean): void;
  }) =>
    createElement(
      'label',
      null,
      createElement('input', {
        type: 'checkbox',
        checked,
        onChange: (event: { target: { checked: boolean } }) => onChange(event.target.checked),
      }),
      label,
    ),
  Modal: ({
    open,
    children,
    footer,
    onClose,
  }: PropsWithChildren<{ open: boolean; footer?: ReactNode; onClose(): void }>) =>
    open
      ? createElement(
          'div',
          { role: 'dialog' },
          children,
          footer,
          createElement('button', { onClick: onClose }, 'Close'),
        )
      : null,
}));

import { MessagingGrantRow } from '../src/client/messaging-grant.js';
import { ExternalIdentitiesEntry } from '../src/client/external-entries.js';
import {
  chooseOption,
  combobox,
  comboboxOption,
  fieldNamed,
  openCombobox,
  typeInto,
} from './primitive-mocks.js';
import { zhTranslate } from '../src/client/locale.js';

async function renderGrant(
  root: Root,
  actions: Parameters<typeof MessagingGrantRow>[0]['actions'],
) {
  await act(async () =>
    root.render(
      createElement(
        'ul',
        null,
        createElement(MessagingGrantRow, { slug: 'ada', actions, t: zhTranslate }),
      ),
    ),
  );
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[data-anchor="lark-grant"] .bh-card-main')!.click(),
  );
}

it('WeChat Profile exposes only qualified proactive sending and separates client acknowledgement from native identity', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const grant: MessagingGrant = {
    id: 'wechat-grant',
    bindingId: 'wechat-binding',
    botSlug: 'ada',
    providerId: 'dsh-im/weixin',
    accountRef: 'wechat',
    accountName: 'Own WeChat',
    fingerprint: 'a'.repeat(64),
    platform: 'weixin',
    targetRef: 'owner',
    targetName: 'Paired owner',
    targetDigest: 'b'.repeat(64),
    revision: 1,
    createdAt: '2026-10-07T00:00:00Z',
  };
  let qualified = false;
  const intent = {
    id: 'wechat-post',
    botSlug: 'ada',
    grantId: grant.id,
    grantRevision: 1,
    text: 'External-only report',
    state: 'provider-accepted' as const,
    createdAt: grant.createdAt,
    report: {
      providerId: grant.providerId,
      accountRef: grant.accountRef,
      fingerprint: grant.fingerprint,
      platform: 'weixin',
      accountName: grant.accountName,
      targetName: grant.targetName,
      conversationId: 'owner',
    },
    receipt: {
      version: 1 as const,
      identityKind: 'client-acknowledgement' as const,
      messageId: 'dsh-weixin-client',
      conversationId: 'owner',
    },
  };
  const actions = {
    openSession: vi.fn(),
    approvalRoute: vi.fn(),
    approvalTest: vi.fn(),
    approvalRetry: vi.fn(),
    pairingReview: vi.fn(),
    messagingIdentity: vi.fn(),
    messagingGroupPolicy: vi.fn(),
    messagingThreadPolicy: vi.fn(),
    messagingReceive: vi.fn(),
    messagingChannelTarget: vi.fn(),
    messagingTargets: vi.fn(),
    messagingAuthorize: vi.fn(),
    messagingRevoke: vi.fn(),
    messagingSend: vi.fn(),
    messagingSnapshot: async (): Promise<MessagingSnapshot> => ({
      accounts: [],
      grants: [{ ...grant, availability: 'available', reception: 'off', canPost: qualified }],
      intents: [intent],
    }),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await renderGrant(root, actions);
    expect(host.querySelector('textarea')).toBeNull();
    qualified = true;
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === zhTranslate('im.refresh'))!
        .click(),
    );
    expect(host.querySelector('textarea')).not.toBeNull();
    expect(host.textContent).toContain(zhTranslate('im.weixinProactive'));
    expect(actions.messagingSend).not.toHaveBeenCalled();
    await act(async () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === intent.text)!.click(),
    );
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain(
      `${zhTranslate('im.clientAcknowledgement')}: dsh-weixin-client`,
    );
    expect(dialog.textContent).toContain(
      `${zhTranslate('im.externalMessageId')}: ${zhTranslate('im.notAvailable')}`,
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('requires explicit target authorization and an explicit send; unknown outcomes survive refresh without resend', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const account = {
    providerId: 'test',
    ref: 'account',
    platform: 'test',
    name: 'Test account',
    fingerprint: 'a'.repeat(64),
    connected: true,
  };
  const target = { ref: 'self', name: 'Self', digest: 'b'.repeat(64) };
  const grant: MessagingGrant = {
    id: 'grant',
    bindingId: 'binding',
    botSlug: 'ada',
    providerId: 'test',
    accountRef: account.ref,
    accountName: account.name,
    fingerprint: account.fingerprint,
    platform: 'test',
    targetRef: target.ref,
    targetName: target.name,
    targetDigest: target.digest,
    revision: 1,
    createdAt: '2026-10-01T00:00:00Z',
  };
  let snapshot: MessagingSnapshot = { accounts: [account], grants: [], intents: [] };
  const messagingAuthorize = vi.fn(async () => {
    snapshot = { ...snapshot, grants: [{ ...grant, availability: 'available', reception: 'off' }] };
    return grant;
  });
  const messagingSend = vi.fn(
    async (_slug: string, grantId: string, requestId: string, text: string) => {
      expect(grantId).toBe(grant.id);
      expect(requestId.length).toBeGreaterThan(0);
      const intent = {
        id: 'intent',
        botSlug: 'ada',
        grantId,
        grantRevision: 1,
        text,
        state: 'unknown-outcome' as const,
        createdAt: '2026-10-01T00:00:01Z',
      };
      snapshot = { ...snapshot, intents: [intent] };
      return intent;
    },
  );
  const actions: Pick<
    BridgeActions,
    | 'messagingGroupPolicy'
    | 'messagingThreadPolicy'
    | 'messagingReceive'
    | 'messagingChannelTarget'
    | 'openSession'
    | 'approvalRoute'
    | 'approvalTest'
    | 'approvalRetry'
    | 'pairingReview'
    | 'messagingIdentity'
    | 'messagingSnapshot'
    | 'messagingTargets'
    | 'messagingAuthorize'
    | 'messagingRevoke'
    | 'messagingSend'
  > = {
    messagingThreadPolicy: async () => undefined,
    messagingGroupPolicy: async () => undefined,
    messagingChannelTarget: async () => undefined,
    messagingReceive: async () => undefined,
    openSession: vi.fn(),
    approvalRoute: vi.fn(async () => {}),
    approvalTest: vi.fn(async () => {}),
    approvalRetry: vi.fn(async () => {}),
    pairingReview: vi.fn(),
    messagingIdentity: vi.fn(),
    messagingSnapshot: async () => snapshot,
    messagingTargets: async () => [target],
    messagingAuthorize,
    messagingRevoke: async () => undefined,
    messagingSend,
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const button = (label: string) => {
    const node = [...container.querySelectorAll('button')].find(
      (item) => item.textContent === label,
    );
    if (!node) throw new Error(`missing button ${label}`);
    return node;
  };
  const select = (label: string, value: string) => chooseOption(label, value);
  try {
    await renderGrant(root, actions);
    expect(messagingAuthorize).not.toHaveBeenCalled();
    expect(messagingSend).not.toHaveBeenCalled();
    expect(button(zhTranslate('im.authorize')).disabled).toBe(true);
    await select(zhTranslate('im.account'), 'test:account');
    await select(zhTranslate('im.target'), 'self');
    expect(messagingAuthorize).not.toHaveBeenCalled();
    await act(async () => button(zhTranslate('im.authorize')).click());
    expect(messagingAuthorize).toHaveBeenCalledWith({
      botSlug: 'ada',
      providerId: 'test',
      accountRef: 'account',
      fingerprint: account.fingerprint,
      targetRef: 'self',
      targetDigest: target.digest,
    });
    expect(messagingSend).not.toHaveBeenCalled();
    const textarea = container.querySelector('textarea');
    if (!textarea) throw new Error('missing message');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
        textarea,
        'Hello',
      );
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button(zhTranslate('im.send')).click());
    expect(messagingSend).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(zhTranslate('im.unknown'));
    expect(container.textContent).toContain(zhTranslate('im.noRetry'));
    await act(async () => button(zhTranslate('im.refresh')).click());
    expect(messagingSend).toHaveBeenCalledTimes(1);
    snapshot = {
      ...snapshot,
      grants: [{ ...grant, availability: 'rebind-required', reception: 'off' }],
    };
    await act(async () => button(zhTranslate('im.refresh')).click());
    expect(container.textContent).toContain(zhTranslate('im.rebind'));
    expect(button(zhTranslate('im.send')).disabled).toBe(true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('changes group intake only after the Human toggles it and can stop it when the provider is unavailable', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const grant: MessagingGrant = {
    id: 'group-grant',
    bindingId: 'binding',
    botSlug: 'ada',
    providerId: 'dsh-im',
    accountRef: 'app',
    accountName: 'Own identity',
    fingerprint: 'a'.repeat(64),
    platform: 'feishu',
    targetRef: 'group',
    targetName: 'Work group',
    targetDigest: 'b'.repeat(64),
    revision: 1,
    createdAt: '2026-10-01T00:00:00Z',
  };
  let snapshot: MessagingSnapshot = {
    accounts: [],
    intents: [],
    grants: [{ ...grant, availability: 'available', canReceive: true, reception: 'off' }],
  };
  snapshot.channelTargets = [{ id: 'shared-work', name: 'Shared work' }];
  const messagingChannelTarget = vi.fn(
    async (slug: string, id: string, channelId: string | null) => {
      expect(slug).toBe('ada');
      expect(id).toBe(grant.id);
      snapshot = {
        ...snapshot,
        grants: snapshot.grants.map((item) => {
          const { receiveTargetChannelId: _prior, ...rest } = item;
          return { ...rest, ...(channelId === null ? {} : { receiveTargetChannelId: channelId }) };
        }),
      };
    },
  );
  const messagingReceive = vi.fn(async (slug: string, id: string, enabled: boolean) => {
    expect(slug).toBe('ada');
    expect(id).toBe(grant.id);
    snapshot = {
      ...snapshot,
      grants: [
        {
          ...grant,
          availability: enabled ? 'unavailable' : 'available',
          canReceive: true,
          reception: enabled ? 'unavailable' : 'off',
          ...(enabled
            ? { receiveScope: { kind: 'group', conversationId: 'oc-group' } as const }
            : {}),
        },
      ],
    };
  });
  const messagingSend = vi.fn(async () => {
    throw new Error('unexpected send');
  });
  const actions = {
    messagingThreadPolicy: async () => undefined,
    messagingGroupPolicy: async () => undefined,
    messagingChannelTarget,
    messagingReceive,
    messagingSend,
    openSession: vi.fn(),
    approvalRoute: vi.fn(async () => {}),
    approvalTest: vi.fn(async () => {}),
    approvalRetry: vi.fn(async () => {}),
    pairingReview: vi.fn(),
    messagingIdentity: vi.fn(),
    messagingSnapshot: async () => snapshot,
    messagingTargets: async () => [],
    messagingAuthorize: async () => grant,
    messagingRevoke: async () => undefined,
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const button = (key: 'im.refresh' | 'im.receiveEnable' | 'im.receiveDisable') => {
    const element = [...container.querySelectorAll('button')].find(
      (item) => item.textContent === zhTranslate(key),
    );
    if (!element) throw new Error('button unavailable');
    return element;
  };
  try {
    await renderGrant(root, actions);
    await act(async () => button('im.refresh').click());
    expect(messagingReceive).not.toHaveBeenCalled();
    expect(messagingChannelTarget).not.toHaveBeenCalled();
    const selector = combobox(zhTranslate('im.localTarget'));
    expect(selector.value).toBe(zhTranslate('im.inboxTarget'));
    await openCombobox(zhTranslate('im.localTarget'));
    expect(document.querySelectorAll('[role="option"]').length).toBe(2);
    await act(async () => comboboxOption('shared-work')!.click());
    expect(messagingChannelTarget.mock.calls).toEqual([['ada', grant.id, 'shared-work']]);
    expect(
      container.querySelector(
        `button[aria-label="${zhTranslate('im.infoFor', { title: zhTranslate('im.localTarget') })}"]`,
      )?.parentElement?.title,
    ).toBe(zhTranslate('im.channelTargetHint'));
    expect(messagingReceive).not.toHaveBeenCalled();
    expect(messagingSend).not.toHaveBeenCalled();
    await chooseOption(zhTranslate('im.localTarget'), '');
    expect(messagingChannelTarget.mock.calls).toEqual([
      ['ada', grant.id, 'shared-work'],
      ['ada', grant.id, null],
    ]);
    await act(async () => button('im.receiveEnable').click());
    expect(messagingReceive.mock.calls).toEqual([['ada', grant.id, true]]);
    expect(button('im.receiveDisable').disabled).toBe(false);
    await act(async () => button('im.receiveDisable').click());
    expect(messagingReceive.mock.calls).toEqual([
      ['ada', grant.id, true],
      ['ada', grant.id, false],
    ]);
    expect(button('im.receiveEnable').disabled).toBe(false);
    expect(messagingSend).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it.each(['test', 'slack'])(
  'gates %s full collection on live ordinary delivery and saves collection independently from wake through Host actions',
  async (platform) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const grant: MessagingGrant = {
      id: 'policy-grant',
      bindingId: 'binding',
      botSlug: 'ada',
      providerId: 'test',
      accountRef: 'account',
      accountName: 'My identity',
      fingerprint: 'a'.repeat(64),
      platform,
      targetRef: 'group',
      targetName: 'Authorized group',
      targetDigest: 'b'.repeat(64),
      revision: 2,
      createdAt: '2026-10-01T00:00:00Z',
      receiveScope: { kind: 'group', conversationId: 'oc-group' },
    };
    let verified = false;
    const policy = {
      collection: 'mentions' as const,
      wake: 'digest' as const,
      count: 5,
      intervalSeconds: 30,
      revision: 0,
      changedAt: '',
      editor: { kind: 'built-in' as const },
    };
    const messagingGroupPolicy = vi.fn(async () => undefined);
    const actions = {
      messagingGroupPolicy,
      messagingThreadPolicy: async () => undefined,
      messagingReceive: async () => undefined,
      messagingChannelTarget: async () => undefined,
      openSession: vi.fn(),
      approvalRoute: vi.fn(async () => {}),
      approvalTest: vi.fn(async () => {}),
      approvalRetry: vi.fn(async () => {}),
      pairingReview: vi.fn(),
      messagingIdentity: vi.fn(),
      messagingSnapshot: async (): Promise<MessagingSnapshot> => ({
        accounts: [],
        intents: [],
        grants: [
          {
            ...grant,
            canReceive: true,
            availability: 'available',
            reception: 'receiving',
            ordinaryDelivery: verified ? 'verified' : 'unverified',
            groupPolicy: policy,
          },
        ],
      }),
      messagingTargets: async () => [],
      messagingAuthorize: async () => grant,
      messagingRevoke: async () => undefined,
      messagingSend: async () => {
        throw new Error('Must not send');
      },
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const button = (key: 'im.refresh' | 'im.policySave') =>
      [...container.querySelectorAll('button')].find(
        (item) => item.textContent === zhTranslate(key),
      )!;
    try {
      await renderGrant(root, actions);
      await act(async () => button('im.refresh').click());
      await openCombobox(zhTranslate('im.collection'));
      expect(comboboxOption('all')?.disabled).toBe(true);
      expect(container.textContent).toContain(zhTranslate('im.ordinaryUnverified'));
      verified = true;
      await act(async () => button('im.refresh').click());
      await openCombobox(zhTranslate('im.collection'));
      expect(comboboxOption('all')?.disabled).toBe(false);
      await act(async () => comboboxOption('all')!.click());
      await chooseOption(zhTranslate('im.ordinaryWake'), 'immediate');
      expect(messagingGroupPolicy).not.toHaveBeenCalled();
      await act(async () => button('im.policySave').click());
      expect(messagingGroupPolicy).toHaveBeenCalledExactlyOnceWith('ada', grant.id, {
        inheritance: 'custom',
        expectedRevision: 0,
        collection: 'all',
        wake: 'immediate',
        count: 5,
        intervalSeconds: 30,
      });
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  },
);

it('keeps native Thread management available after a grant migrates to Channel Bridge routes', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const snapshot: MessagingSnapshot = {
    accounts: [],
    intents: [],
    grants: [
      {
        id: 'slack-grant',
        bindingId: 'binding',
        botSlug: 'ada',
        providerId: 'dsh-im',
        accountRef: 'app',
        accountName: 'Own Slack identity',
        fingerprint: 'a'.repeat(64),
        platform: 'slack',
        targetRef: 'team',
        targetName: 'Work channel',
        targetDigest: 'b'.repeat(64),
        revision: 1,
        createdAt: '',
        availability: 'available',
        reception: 'receiving',
        bridgeRoutes: [],
        threadPolicies: [
          {
            threadId: '1791188299.721909',
            rootId: '1791188299.721909',
            conversationId: 'C-team',
            anchorSourceEventId: 'source-slack',
            fingerprint: 'a'.repeat(64),
            mode: 'inherit',
            revision: 3,
            wake: null,
            changedAt: '',
            editor: { kind: 'bot', botSlug: 'ada' },
            ordinaryDelivery: 'verified',
            preview: 'Native Slack topic',
          },
        ],
      },
    ],
  };
  const messagingThreadPolicy = vi.fn(async () => undefined);
  const actions = {
    messagingThreadPolicy,
    messagingGroupPolicy: vi.fn(),
    messagingChannelTarget: vi.fn(),
    messagingReceive: vi.fn(),
    messagingSend: vi.fn(),
    openSession: vi.fn(),
    approvalRoute: vi.fn(async () => {}),
    approvalTest: vi.fn(async () => {}),
    approvalRetry: vi.fn(async () => {}),
    pairingReview: vi.fn(),
    messagingIdentity: vi.fn(),
    messagingSnapshot: async () => snapshot,
    messagingTargets: async () => [],
    messagingAuthorize: vi.fn(),
    messagingRevoke: vi.fn(),
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await renderGrant(root, actions);
    expect(container.textContent).toContain(zhTranslate('bridge.managed'));
    expect(container.querySelector('table')?.textContent).toContain('Native Slack topic');
    const manage = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === zhTranslate('im.threadManage'),
    );
    if (!manage) throw new Error('missing Thread management');
    await act(async () => manage.click());
    await chooseOption(zhTranslate('im.threadParticipation'), 'exclude');
    const submit = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === zhTranslate('im.threadSave'),
    );
    if (!submit) throw new Error('missing Thread save');
    await act(async () => submit.click());
    expect(messagingThreadPolicy).toHaveBeenCalledExactlyOnceWith('ada', 'source-slack', {
      mode: 'exclude',
      expectedRevision: 3,
      wake: null,
    });
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('shows per-Thread state, refuses unverified follow and saves the exact Human revision from the Modal', async () => {
  const { ThreadReceptionSettings } = await import('../src/client/thread-reception-settings.js');
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let verified = false;
  const save = vi.fn(async () => true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = () =>
    root.render(
      createElement(ThreadReceptionSettings, {
        policies: [
          {
            threadId: 'omt-topic',
            conversationId: 'oc-team',
            rootId: 'om-root',
            anchorSourceEventId: 'source-one',
            fingerprint: 'a'.repeat(64),
            mode: 'inherit',
            revision: 7,
            wake: null,
            changedAt: '',
            editor: { kind: 'bot', botSlug: 'ada' },
            ordinaryDelivery: verified ? 'verified' : 'unverified',
            preview: 'Test Thread message',
          },
        ],
        busy: false,
        t: zhTranslate,
        save,
      }),
    );
  const manage = () =>
    [...container.querySelectorAll('button')].find(
      (button) => button.textContent === zhTranslate('im.threadManage'),
    )!;
  const submit = () =>
    [...container.querySelectorAll('button')].find(
      (button) => button.textContent === zhTranslate('im.threadSave'),
    )!;
  try {
    await act(async () => render());
    expect(container.querySelector('table')?.textContent).toContain('Test Thread message');
    await act(async () => manage().click());
    await chooseOption(zhTranslate('im.threadParticipation'), 'follow');
    expect(submit().disabled).toBe(true);
    expect(container.textContent).toContain(zhTranslate('im.threadUnverified'));
    verified = true;
    await act(async () => render());
    await act(async () => manage().click());
    await chooseOption(zhTranslate('im.threadParticipation'), 'follow');
    expect(submit().disabled).toBe(false);
    await chooseOption(zhTranslate('im.ordinaryWake'), 'digest');
    await typeInto(fieldNamed(zhTranslate('im.digestCount')), '0');
    expect(submit().disabled).toBe(true);
    await typeInto(fieldNamed(zhTranslate('im.digestCount')), '5');
    expect(submit().disabled).toBe(false);
    await chooseOption(zhTranslate('im.ordinaryWake'), 'inherit');
    await act(async () => submit().click());
    expect(save).toHaveBeenCalledExactlyOnceWith('source-one', {
      mode: 'follow',
      expectedRevision: 7,
      wake: null,
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it.each(['report', 'reply'] as const)(
  'inspects the complete external %s and native correspondence without sending it again',
  async (kind) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const messagingSend = vi.fn();
    const text = 'Morning report '.repeat(20);
    const actions = {
      openSession: vi.fn(),
      approvalRoute: vi.fn(async () => {}),
      approvalTest: vi.fn(async () => {}),
      approvalRetry: vi.fn(async () => {}),
      pairingReview: vi.fn(),
      messagingIdentity: vi.fn(),
      messagingGroupPolicy: vi.fn(),
      messagingThreadPolicy: vi.fn(),
      messagingReceive: vi.fn(),
      messagingChannelTarget: vi.fn(),
      messagingTargets: vi.fn(),
      messagingAuthorize: vi.fn(),
      messagingRevoke: vi.fn(),
      messagingSend,
      messagingSnapshot: async (): Promise<MessagingSnapshot> => ({
        accounts: [],
        grants: [],
        intents: [
          {
            id: 'report-intent',
            botSlug: 'ada',
            grantId: 'grant',
            grantRevision: 1,
            text,
            state: 'provider-accepted',
            createdAt: '2026-10-03T07:29:24Z',
            [kind]: {
              providerId: 'dsh-im',
              accountRef: 'own-app',
              fingerprint: 'a'.repeat(64),
              platform: 'feishu',
              accountName: 'Own Bot identity',
              targetName: 'QA group',
              conversationId: 'external-group',
              ...(kind === 'reply'
                ? {
                    route: {
                      messageId: 'source-message',
                      conversationId: 'external-group',
                      actorId: 'responder-scoped-sender',
                      threadId: 'source-topic',
                    },
                  }
                : {}),
            },
            ...(kind === 'reply' ? { sourceEventId: 'canonical-shared-source' } : {}),
            receipt: {
              version: 1,
              messageId: 'native-report-id',
              conversationId: 'external-group',
            },
          },
        ],
      }),
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await renderGrant(root, actions);
      expect(container.textContent).not.toContain(zhTranslate('im.externalOnly'));
      const inspect = container.querySelector<HTMLButtonElement>(
        `button[aria-label="${zhTranslate(kind === 'reply' ? 'im.inspectReply' : 'im.inspectReport', { name: 'QA group' })}"]`,
      );
      if (!inspect) throw new Error('report inspection unavailable');
      expect(inspect.textContent).not.toBe(text);
      await act(async () => inspect.click());
      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog?.textContent).toContain(text);
      expect(dialog?.textContent).toContain('Own Bot identity');
      expect(dialog?.textContent).toContain(zhTranslate('im.externalOnly'));
      expect(dialog?.querySelector('details')?.open).toBe(false);
      expect(dialog?.textContent).toContain('native-report-id');
      if (kind === 'reply') {
        expect(dialog?.textContent).toContain('canonical-shared-source');
        expect(dialog?.textContent).toContain('source-topic');
      }
      const close = [...container.querySelectorAll('button')].find(
        (node) => node.textContent === 'Close',
      );
      await act(async () => close?.click());
      expect(container.querySelector('[role="dialog"]')?.textContent).not.toContain(
        zhTranslate('im.externalOnly'),
      );
      await act(async () =>
        [...container.querySelectorAll('button')]
          .find((node) => node.textContent === 'Close')
          ?.click(),
      );
      expect(container.querySelector('[role="dialog"]')).toBeNull();
      expect(messagingSend).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  },
);

it('shows a rejected pairing review beside its controls and clears it after a successful refresh', async () => {
  const snapshot: MessagingSnapshot = {
    accounts: [],
    grants: [],
    intents: [],
    pairings: [
      {
        id: 'stale-request',
        reference: 'STALETEST',
        botSlug: 'ada',
        bindingId: 'binding',
        accountName: 'QA Lark',
        actorId: 'ou_test',
        actorName: 'QA applicant',
        conversationId: 'oc_test',
        status: 'pending',
        capabilities: [],
        createdAt: '2026-10-06T00:00:00.000Z',
        expiresAt: '2026-10-06T00:10:00.000Z',
        revision: 1,
        attempts: 1,
      },
    ],
  };
  const actions = {
    openSession: vi.fn(),
    approvalRoute: vi.fn(async () => {}),
    approvalTest: vi.fn(async () => {}),
    approvalRetry: vi.fn(async () => {}),
    pairingReview: vi.fn(async () => {
      throw new Error('pairing-stale');
    }),
    messagingIdentity: vi.fn(),
    messagingThreadPolicy: vi.fn(),
    messagingGroupPolicy: vi.fn(),
    messagingReceive: vi.fn(),
    messagingChannelTarget: vi.fn(),
    messagingSnapshot: vi.fn(async () => snapshot),
    messagingTargets: vi.fn(async () => []),
    messagingAuthorize: vi.fn(),
    messagingRevoke: vi.fn(),
    messagingSend: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        createElement(ExternalIdentitiesEntry, {
          scope: 'personabot',
          channelId: 'dm',
          botSlug: 'ada',
          actions: actions as unknown as BridgeActions,
          t: zhTranslate,
        }),
      ),
    );
    await act(async () =>
      [...host.querySelectorAll<HTMLButtonElement>('.bh-card-main')]
        .find((item) => item.textContent?.includes(zhTranslate('pairing.title')))!
        .click(),
    );
    const pairing = host.querySelector('.bh-im-pairing')!;
    const button = (key: 'pairing.approve' | 'pairing.refresh') =>
      [...pairing.querySelectorAll('button')].find(
        (item) => item.textContent === zhTranslate(key),
      )!;
    await act(async () =>
      pairing.querySelector<HTMLInputElement>('.bh-pairing-detail input[type=checkbox]')!.click(),
    );
    await act(async () => button('pairing.approve').click());
    expect(actions.pairingReview).toHaveBeenCalledExactlyOnceWith('ada', {
      kind: 'approve',
      id: 'stale-request',
      expectedRevision: 1,
      capabilities: ['approve'],
    });
    expect(pairing.querySelector('[role="alert"]')?.textContent).toBe(zhTranslate('pairing.error'));
    expect(pairing.closest('details')).toBeNull();
    expect(button('pairing.approve').disabled).toBe(false);
    await act(async () => button('pairing.refresh').click());
    expect(pairing.querySelector('[role="alert"]')).toBeNull();
    expect(actions.pairingReview).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
