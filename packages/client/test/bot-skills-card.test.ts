// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const base: Record<string, unknown> = {
    Button: ({
      children,
      onClick,
      disabled,
      type = 'button',
      ...rest
    }: PropsWithChildren<{ onClick?: () => void; disabled?: boolean; type?: 'button' }>) =>
      createElement(
        'button',
        { type, onClick, disabled, 'aria-label': (rest as Record<string, unknown>)['aria-label'] },
        children,
      ),
    Tag: ({ children }: PropsWithChildren) => createElement('span', { 'data-tag': '' }, children),
  };
  return new Proxy(base, {
    get: (target, key) =>
      typeof key === 'string' && !(key in target) && key !== 'then'
        ? () => null
        : target[key as string],
    has: () => true,
  });
});

const { BotSkillsCard, marketplaceSkillFiles, skillFrontmatterDescription } =
  await import('../src/client/bot-skills-card.js');
const { en } = await import('../src/client/locale.js');

const t = ((key: string, params?: Record<string, unknown>) =>
  Object.entries(params ?? {}).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    (en as Record<string, string>)[key] ?? key,
  )) as Parameters<typeof BotSkillsCard>[0]['t'];
const mounted: (() => void)[] = [];
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

async function render(element: ReturnType<typeof createElement>): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

async function click(element: Element | null | undefined): Promise<void> {
  if (!(element instanceof HTMLElement)) throw new Error('missing element');
  await act(async () => element.click());
}

function button(host: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find(
    (node) => node.textContent?.trim() === label || node.getAttribute('aria-label') === label,
  );
}

describe('Skills profile card', () => {
  function source(initial: string[]) {
    let names = [...initial];
    let notify: (() => void) | undefined;
    return {
      list: vi.fn(async () =>
        names.map((name) => ({
          name,
          description: `Do ${name}`,
          path: `.agents/skills/${name}/SKILL.md`,
          userInvocable: name !== 'notes',
        })),
      ),
      read: vi.fn(async (name: string) => ({
        name,
        description: `Do ${name}`,
        owner: { kind: 'bot' as const, botSlug: 'ada' },
        path: `.agents/skills/${name}/SKILL.md`,
        content: `Body of ${name}`,
      })),
      remove: vi.fn(async (name: string) => {
        names = names.filter((entry) => entry !== name);
      }),
      subscribe: vi.fn((listener: () => void) => {
        notify = listener;
        return () => {
          notify = undefined;
        };
      }),
      add(name: string) {
        names = [...names, name];
        notify?.();
      },
    };
  }

  it('lists Skills, opens SKILL.md and deletes only after an inline confirmation', async () => {
    const skills = source(['notes', 'review']);
    const host = await render(createElement(BotSkillsCard, { source: skills, botName: 'Ada', t }));
    const rows = [...host.querySelectorAll('[data-skill-row]')].map((row) => row.textContent);
    expect(rows).toEqual(['/notesModel onlyDo notes', '/reviewDo review']);

    await click(host.querySelector('[data-skill-row="review"]'));
    expect(skills.read).toHaveBeenCalledWith('review');
    expect(host.querySelector('[data-skill-body] .bh-memory-markdown')?.textContent).toBe(
      'Body of review',
    );
    expect(host.textContent).toContain('.agents/skills/review/SKILL.md');

    await click(button(host, 'Delete'));
    expect(skills.remove).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Delete /review from Ada's Memory?");
    await click(button(host, 'Cancel'));
    expect(button(host, 'Delete /review')).toBeUndefined();

    await click(button(host, 'Delete'));
    await click(button(host, 'Delete /review'));
    expect(skills.remove).toHaveBeenCalledExactlyOnceWith('review');
    expect([...host.querySelectorAll('[data-skill-row]')].map((row) => row.textContent)).toEqual([
      '/notesModel onlyDo notes',
    ]);
  });

  it('refreshes from live Skill catalog events and shows guidance when empty', async () => {
    const skills = source([]);
    const host = await render(createElement(BotSkillsCard, { source: skills, botName: 'Ada', t }));
    expect(host.textContent).toContain('Ada has no Skills yet. Ask in chat to install one.');
    await act(async () => skills.add('deploy'));
    expect(host.querySelector('[data-skill-row="deploy"]')).not.toBeNull();
  });

  it('keeps a failed delete recoverable next to the action', async () => {
    const skills = source(['review']);
    skills.remove.mockRejectedValueOnce(new Error('memory busy'));
    const host = await render(createElement(BotSkillsCard, { source: skills, botName: 'Ada', t }));
    await click(host.querySelector('[data-skill-row="review"]'));
    await click(button(host, 'Delete'));
    await click(button(host, 'Delete /review'));
    expect(host.textContent).toContain("Couldn't delete /review: memory busy");
    expect(button(host, 'Delete /review')?.disabled).toBe(false);
  });
});

describe('Marketplace Skills block', () => {
  it('derives root Skills from package files with .dsh precedence', () => {
    const file = (path: string) => ({ path, size: 10, kind: 'text' as const });
    expect(
      marketplaceSkillFiles([
        file('SOUL.md'),
        file('.agents/skills/review/SKILL.md'),
        file('.agents/skills/review/checklist.md'),
        file('.dsh/skills/review/SKILL.md'),
        file('.agents/skills/notes.md'),
        file('docs/.agents/skills/nested/SKILL.md'),
      ]).map(({ name, file: { path } }) => [name, path]),
    ).toEqual([
      ['notes', '.agents/skills/notes.md'],
      ['review', '.dsh/skills/review/SKILL.md'],
    ]);
    expect(skillFrontmatterDescription('---\nname: x\ndescription: "Ship it"\n---\nbody')).toBe(
      'Ship it',
    );
    expect(skillFrontmatterDescription('no frontmatter')).toBe('');
  });
});
