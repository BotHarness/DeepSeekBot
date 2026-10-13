// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  const { createElement: element } = await import('react');
  return {
    ...dialogPrimitives(),
    IconCloseOutlineRegular: () => element('span'),
    SegmentedControl: (props: {
      label: string;
      value: string;
      disabled?: boolean;
      onChange: (value: string) => void;
      options: { label: string; value: string }[];
    }) =>
      element(
        'select',
        {
          'aria-label': props.label,
          value: props.value,
          disabled: props.disabled,
          onChange: (event: { currentTarget: HTMLSelectElement }) =>
            props.onChange(event.currentTarget.value),
        },
        ...props.options.map((option) =>
          element('option', { key: option.value, value: option.value }, option.label),
        ),
      ),
    Tag: (props: { children?: ReactNode }) => element('span', null, props.children),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { BridgeCallError } from '../src/client/bridge.js';
import {
  CreatePersonaBotModal,
  normalizeRoleBadges,
  personaBotCreateError,
} from '../src/client/persona-bot-create.js';
import { buttonNamed, dialog, fieldNamed, typeInto } from './primitive-mocks.js';

describe('PersonaBot creation form', () => {
  it('asks for the Human-facing name, optional tags, and an optional bio', () => {
    const markup = renderToStaticMarkup(
      createElement(CreatePersonaBotModal, {
        actions: { createBot: vi.fn() } as unknown as BridgeActions,
        onCancel: vi.fn(),
        onCreated: vi.fn(),
      }),
    );

    expect(markup).toContain('创建 Bot');
    expect(markup).toContain('名称用于列表和 @；内部身份由系统生成');
    expect(markup).not.toContain('Git 仓库地址');
    expect(markup).toContain('标签（可选）');
    expect(markup).toContain('简介（可选）');
    expect(markup).toContain('placeholder="例如：小研"');
    expect(markup).toContain('placeholder="例如：研究员"');
    expect(markup).toContain('placeholder="例如：负责代码审查与质量把关"');
    expect(markup).not.toContain('标识');
    expect(markup).not.toContain('Persona</');
    expect(markup).toContain('<textarea');
    expect(markup).toContain('人格起点');
    expect(markup).toContain('同事');
    expect(markup).toContain('角色扮演');
    expect(markup).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>创建<\/button>/u);
  });

  it('identifies the target section when creating a PersonaBot inside it', () => {
    const markup = renderToStaticMarkup(
      createElement(CreatePersonaBotModal, {
        actions: { createBot: vi.fn() } as unknown as BridgeActions,
        sectionId: 'section-work',
        sectionName: '工作流',
        onCancel: vi.fn(),
        onCreated: vi.fn(),
      }),
    );

    expect(markup).toContain('在「工作流」中创建 Bot');
  });

  it('asks only for the repository when opened from Import from GitHub', () => {
    const markup = renderToStaticMarkup(
      createElement(CreatePersonaBotModal, {
        actions: { createBot: vi.fn() } as unknown as BridgeActions,
        source: 'git',
        onCancel: vi.fn(),
        onCreated: vi.fn(),
      }),
    );

    expect(markup).toContain('从 GitHub 导入 Bot');
    expect(markup).toContain('Git 仓库地址');
    expect(markup).not.toContain('人格起点');
  });

  it('normalizes, de-duplicates, and drops blank role badges', () => {
    expect(normalizeRoleBadges([' 研究员 ', '写作', '研究员', ' '])).toEqual(['研究员', '写作']);
  });

  it('turns stable Host errors into actionable inline copy without exposing IDs', () => {
    expect(personaBotCreateError(new BridgeCallError('invalid-input', 'bad'))).toBe(
      '请检查 Bot 名称、标签或简介。',
    );
    expect(personaBotCreateError(new BridgeCallError('duplicate', 'exists'))).toBe(
      '系统未能分配唯一身份，请重试。',
    );
    expect(
      personaBotCreateError(new BridgeCallError('git-not-found', 'spawn git ENOENT')),
    ).toContain('Git');
    expect(
      personaBotCreateError(new BridgeCallError('git-not-found', 'spawn git ENOENT')),
    ).not.toContain('ENOENT');
    expect(personaBotCreateError(new BridgeCallError('invalid-git-url', 'bad'))).toContain('HTTPS');
    expect(
      personaBotCreateError(new BridgeCallError('git-clone-failed', 'private token')),
    ).not.toContain('private token');
    expect(
      personaBotCreateError(new BridgeCallError('git-clone-timeout', 'private token')),
    ).toContain('超时');
    expect(personaBotCreateError(new Error('disk read-only'))).toBe('disk read-only');
  });
});

async function withForm(
  test: (
    host: HTMLDivElement,
    create: ReturnType<typeof vi.fn>,
    onCreated: ReturnType<typeof vi.fn>,
    open: ReturnType<typeof vi.fn>,
  ) => Promise<void>,
  source: 'empty' | 'git' = 'empty',
  created: Record<string, unknown> = { slug: 'bot', displayName: 'Bot' },
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const create = vi.fn(async () => created);
  const onCreated = vi.fn();
  const open = vi.fn(async () => undefined);
  try {
    await act(async () =>
      root.render(
        createElement(CreatePersonaBotModal, {
          actions: { createBot: create, openCreatedBot: open } as unknown as BridgeActions,
          source,
          onCancel: vi.fn(),
          onCreated,
        }),
      ),
    );
    await test(host, create, onCreated, open);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
}

async function typeText(host: HTMLElement, selector: string, value: string) {
  const input = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function choose(host: HTMLElement, label: string, value: string) {
  const input = host.querySelector<HTMLSelectElement>('select[aria-label="' + label + '"]')!;
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function submit(host: HTMLElement) {
  await act(async () => buttonNamed('创建', host).click());
}

describe('editable creation starting points', () => {
  it('retains independent drafts while switching and submits exact edited persona without preset metadata', async () => {
    await withForm(async (host, create) => {
      expect(host.querySelector('textarea')!.value).toBe('');
      await typeText(host, 'input[placeholder="例如：小研"]', 'Ada');
      await choose(host, '人格起点', 'colleague');
      expect(host.querySelector('textarea')!.value).toContain('# 协作方式');
      const edited = '# Ada\n\n  Human-written identity.\n';
      await typeText(host, 'textarea', edited);
      await choose(host, '人格起点', 'roleplay');
      expect(host.querySelector('textarea')!.value).toContain('# 角色与世界');
      await typeText(host, 'textarea', '# A lunar librarian\n');
      await choose(host, '人格起点', 'blank');
      expect(host.querySelector('textarea')!.value).toBe('');
      await choose(host, '人格起点', 'colleague');
      expect(host.querySelector('textarea')!.value).toBe(edited);
      await submit(host);
      expect(create).toHaveBeenCalledWith(
        { displayName: 'Ada', roles: [], persona: edited },
        undefined,
      );
    });
  });

  it('does not seed imported memory when importing from GitHub', async () => {
    await withForm(async (host, create) => {
      expect(host.querySelector('textarea')).toBeNull();
      await typeText(host, 'input[placeholder="例如：小研"]', 'Imported');
      await typeText(
        host,
        'input[placeholder="https://github.com/owner/repo.git"]',
        'https://github.com/owner/repo.git',
      );
      await submit(host);
      expect(create).toHaveBeenCalledWith(
        { displayName: 'Imported', roles: [], gitUrl: 'https://github.com/owner/repo.git' },
        undefined,
      );
    }, 'git');
  });

  it('closes right away after a normal GitHub import', async () => {
    await withForm(async (host, _create, onCreated) => {
      await typeText(host, 'input[placeholder="例如：小研"]', 'Imported');
      await typeText(
        host,
        'input[placeholder="https://github.com/owner/repo.git"]',
        'https://github.com/owner/repo.git',
      );
      await submit(host);
      expect(onCreated).toHaveBeenCalledOnce();
      expect(host.querySelector('[data-https-fallback]')).toBeNull();
    }, 'git');
  });

  it('tells the Human when an SSH import switched to HTTPS before closing', async () => {
    await withForm(
      async (host, _create, onCreated, open) => {
        await typeText(host, 'input[placeholder="例如：小研"]', 'Imported');
        await typeText(
          host,
          'input[placeholder="https://github.com/owner/repo.git"]',
          'git@github.com:owner/repo.git',
        );
        await submit(host);
        expect(onCreated).not.toHaveBeenCalled();
        expect(open).not.toHaveBeenCalled();
        const notice = host.querySelector('[data-https-fallback]')!;
        expect(host.textContent).toContain('已改用 HTTPS 导入');
        expect(notice.textContent).toContain('git@github.com:owner/repo.git');
        expect(notice.textContent).toContain('https://github.com/owner/repo.git');
        expect(notice.querySelectorAll('pre')).toHaveLength(2);
        const caption = notice.querySelector('[data-https-fallback-reason="auth"]')!;
        expect(caption.textContent).toContain('服务器拒绝了 SSH 登录');
        expect(caption.textContent).toContain(
          'Git 输出：git@github.com: Permission denied (publickey).',
        );
        expect(() => buttonNamed('取消', host)).toThrow();
        expect(host.querySelector('[data-https-fallback-done]')?.textContent).toBe('完成');
        await act(async () => buttonNamed('完成', host).click());
        expect(open).toHaveBeenCalledWith(expect.objectContaining({ slug: 'bot' }), undefined);
        expect(onCreated).toHaveBeenCalledOnce();
      },
      'git',
      {
        slug: 'bot',
        displayName: 'Imported',
        httpsFallback: {
          from: 'git@github.com:owner/repo.git',
          to: 'https://github.com/owner/repo.git',
          reason: 'auth',
          detail: 'git@github.com: Permission denied (publickey).',
        },
      },
    );
  });

  it('allows the blank starting point to stay blank', async () => {
    await withForm(async (host, create) => {
      await typeText(host, 'input[placeholder="例如：小研"]', 'Blank');
      await submit(host);
      expect(create).toHaveBeenCalledWith(
        { displayName: 'Blank', roles: [], persona: '' },
        undefined,
      );
    });
  });
});

describe('PersonaBot creation dialog', () => {
  async function render(createBot: ReturnType<typeof vi.fn>, onCancel = vi.fn()) {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        createElement(CreatePersonaBotModal, {
          actions: { createBot } as unknown as BridgeActions,
          onCancel,
          onCreated: vi.fn(),
        }),
      ),
    );
    return {
      host,
      done: async () => {
        await act(async () => root.unmount());
        host.remove();
      },
    };
  }

  it('labels each field and submits the trimmed name and bio on Enter', async () => {
    const createBot = vi.fn(async () => ({ slug: 'ada', displayName: 'Ada' }));
    const { done } = await render(createBot);
    try {
      expect(dialog().getAttribute('aria-label')).toBe('创建 Bot');
      expect(fieldNamed('名称').placeholder).toBe('例如：小研');
      expect(fieldNamed('简介（可选）').placeholder).toBe('例如：负责代码审查与质量把关');
      expect(fieldNamed('标签（可选）').placeholder).toBe('例如：研究员');
      await typeInto(fieldNamed('名称'), '  Ada  ');
      await typeInto(fieldNamed('简介（可选）'), ' Reviews code ');
      await act(async () => dialog().querySelector('form')!.requestSubmit());
      expect(createBot).toHaveBeenCalledWith(
        { displayName: 'Ada', roles: [], persona: '', description: 'Reviews code' },
        undefined,
      );
    } finally {
      await done();
    }
  });

  it('refuses a blank name and cancels through the footer', async () => {
    const createBot = vi.fn();
    const onCancel = vi.fn();
    const { done } = await render(createBot, onCancel);
    try {
      await act(async () => dialog().querySelector('form')!.requestSubmit());
      expect(createBot).not.toHaveBeenCalled();
      await act(async () => buttonNamed('取消').click());
      expect(onCancel).toHaveBeenCalledTimes(1);
    } finally {
      await done();
    }
  });

  it('locks the dialog while creating and shows the Host refusal inline', async () => {
    let reject: (cause: unknown) => void = () => undefined;
    const createBot = vi.fn(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    const { host, done } = await render(createBot);
    try {
      await typeInto(fieldNamed('名称'), 'Ada');
      await act(async () => buttonNamed('创建').click());
      expect(buttonNamed('创建中').disabled).toBe(true);
      expect(buttonNamed('取消').disabled).toBe(true);
      await act(async () => reject(new BridgeCallError('invalid-input', 'bad')));
      expect(host.querySelector('[role="alert"]')?.textContent).toContain(
        '请检查 Bot 名称、标签或简介。',
      );
      expect(buttonNamed('创建').disabled).toBe(false);
    } finally {
      await done();
    }
  });
});
