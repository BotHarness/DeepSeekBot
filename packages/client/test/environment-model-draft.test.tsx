// @vitest-environment jsdom
import {
  act,
  createElement,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { ModelSettingsClient } from '../../../apps/mobile/src/host/bot-settings.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
  Checkbox: () => null,
}));
vi.mock('../src/client/model-picker.js', () => ({
  ModelPicker: ({ onChange }: { onChange(value: { key: string; effort: string }): void }) =>
    createElement(
      'button',
      { onClick: () => onChange({ key: JSON.stringify(['deepseek', 'model']), effort: 'low' }) },
      'Change model',
    ),
}));
vi.mock('../src/client/combobox.js', () => ({ Combobox: () => null }));
vi.mock('../src/client/ds/select.js', () => ({
  Select: ({
    value,
    options,
    onChange,
  }: {
    value: string;
    options: { value: string; label: ReactNode }[];
    onChange(value: string): void;
  }) =>
    createElement(
      'select',
      {
        value,
        onChange: (event: ChangeEvent<HTMLSelectElement>) => onChange(event.currentTarget.value),
      },
      options.map((option) =>
        createElement('option', { key: option.value, value: option.value }, option.label),
      ),
    ),
}));

import { RemoteHostModels } from '../src/client/remote-host-models.js';
import { hostSettingsDrafts, type HostDraftChoice } from '../src/client/host-settings-drafts.js';
import { en } from '../src/client/locale.js';

it('explains a launch-locked default model refusal without replaying the write', async () => {
  const route = { provider: 'deepseek', model: 'model' };
  let writes = 0;
  const client: ModelSettingsClient = {
    async call(method) {
      if (method === 'modelCatalog')
        return {
          models: [{ ...route, providerName: 'DeepSeek', modelName: 'Model' }],
          default: route,
          defaultRevision: 0,
        };
      if (method === 'modelPresets') return { presets: [] };
      if (method === 'onboardingModel') {
        writes += 1;
        throw Object.assign(
          new Error(
            'Configuration for "agent-default-model" is overridden by a home patch or command-line overlay',
          ),
          { code: 'invalid-input' },
        );
      }
      throw Error(`Unexpected method ${method}`);
    },
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  try {
    await act(async () => {
      root.render(
        createElement(RemoteHostModels, {
          hostId: 'locked',
          client,
          t: (key) => Object.entries(en).find(([name]) => name === key)?.[1] ?? key,
        }),
      );
      await flush();
    });
    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Change model')
        ?.click();
      await flush();
    });
    expect(writes).toBe(1);
    expect(container.textContent).toContain(
      "This Host's default model is fixed by its launch settings.",
    );
    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Refresh model list')
        ?.click();
      await flush();
    });
    expect(writes).toBe(1);
  } finally {
    await act(() => root.unmount());
    container.remove();
  }
});

it('keeps offline and refused preset drafts, never saves on blur, and saves or discards through the original owner', async () => {
  const route = { provider: 'deepseek', model: 'model' };
  let savedName = 'Original';
  let revision = 3;
  let fail = false;
  let loseReply = false;
  let createdName: string | undefined;
  let writes = 0;
  const client: ModelSettingsClient = {
    async call(method, args = {}) {
      if (method === 'modelCatalog')
        return {
          models: [{ ...route, providerName: 'DeepSeek', modelName: 'Model' }],
          default: route,
          defaultRevision: 1,
        };
      if (method === 'modelPresets')
        return {
          presets: [
            {
              id: 'preset',
              name: savedName,
              revision,
              orchestrator: route,
              assignmentDefault: route,
            },
            ...(createdName === undefined
              ? []
              : [
                  {
                    id: 'created',
                    name: createdName,
                    revision: 1,
                    orchestrator: route,
                    assignmentDefault: route,
                  },
                ]),
          ],
        };
      if (method === 'modelPresetUpdate') {
        writes += 1;
        if (fail) throw Error('refused');
        expect(args.expectedRevision).toBe(revision);
        if (typeof args.name !== 'string') throw Error('name missing');
        savedName = args.name;
        revision += 1;
        if (loseReply) throw Error('response lost after commit');
        return { preset: { id: 'preset' } };
      }
      if (method === 'modelPresetCreate') {
        writes += 1;
        if (typeof args.name !== 'string') throw Error('name missing');
        createdName = args.name;
        return { preset: { id: 'created' } };
      }
      throw Error(`Unexpected method ${method}`);
    },
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let available = true;
  const render = () =>
    root.render(
      createElement(RemoteHostModels, {
        hostId: 'b',
        client,
        available,
        t: (key) => Object.entries(en).find(([name]) => name === key)?.[1] ?? key,
      }),
    );
  let choice: HostDraftChoice = 'cancel';
  const release = hostSettingsDrafts.prompt('b', async () => choice);
  const flush = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const edit = async (name: string) => {
    await act(() => {
      const input = container.querySelector('input');
      if (!input) throw Error('preset name input missing');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, name);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
  };
  try {
    await act(async () => {
      render();
      await flush();
    });
    await act(async () => {
      const select = container.querySelector('select');
      if (!select) throw Error('scope selector missing');
      select.value = 'preset';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    await edit('Draft');
    expect(writes).toBe(0);
    expect(await hostSettingsDrafts.prepare('b')).toBe(false);
    expect(container.querySelector('input')?.value).toBe('Draft');
    available = false;
    await act(render);
    choice = 'save';
    expect(await hostSettingsDrafts.prepare('b')).toBe(false);
    expect(writes).toBe(0);
    expect(container.querySelector('input')?.value).toBe('Draft');
    available = true;
    await act(render);
    fail = true;
    await act(async () => {
      expect(await hostSettingsDrafts.prepare('b')).toBe(false);
    });
    expect(container.querySelector('input')?.value).toBe('Draft');
    expect(savedName).toBe('Original');
    fail = false;
    await act(async () => {
      expect(await hostSettingsDrafts.prepare('b')).toBe(true);
    });
    expect(savedName).toBe('Draft');
    expect(container.querySelector('input')?.value).toBe('Draft');
    await edit('Discarded');
    choice = 'discard';
    await act(async () => {
      expect(await hostSettingsDrafts.prepare('b')).toBe(true);
    });
    expect(savedName).toBe('Draft');
    expect(container.querySelector('input')?.value).toBe('Draft');
    expect(writes).toBe(2);
    await edit('Owner committed');
    choice = 'save';
    loseReply = true;
    await act(async () => {
      expect(await hostSettingsDrafts.prepare('b')).toBe(false);
    });
    expect(savedName).toBe('Owner committed');
    expect(container.querySelector('input')?.value).toBe('Owner committed');
    expect(await hostSettingsDrafts.prepare('b')).toBe(true);
    expect(writes).toBe(3);
    loseReply = false;
    await act(async () => {
      const select = container.querySelector('select');
      if (!select) throw Error('scope selector missing');
      select.value = '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    await edit('New preset');
    choice = 'cancel';
    expect(await hostSettingsDrafts.prepare('b')).toBe(false);
    expect(createdName).toBeUndefined();
    choice = 'save';
    await act(async () => {
      expect(await hostSettingsDrafts.prepare('b')).toBe(true);
    });
    expect(createdName).toBe('New preset');
    expect(container.querySelector('input')?.value).toBe('');
    expect(writes).toBe(4);
  } finally {
    release();
    await act(() => root.unmount());
    container.remove();
  }
});

it('starts a fresh model session for replacement access to the same Host while an old write is pending', async () => {
  const route = { provider: 'deepseek', model: 'model' };
  let finishOld: () => void = () => {
    throw Error('old write was not started');
  };
  let newName = 'New access preset';
  let newWrites = 0;
  const old: ModelSettingsClient = {
    async call(method) {
      if (method === 'modelCatalog')
        return {
          models: [{ ...route, providerName: 'DeepSeek', modelName: 'Model' }],
          default: route,
          defaultRevision: 1,
        };
      if (method === 'modelPresets')
        return {
          presets: [
            {
              id: 'preset',
              name: 'Old access preset',
              revision: 1,
              orchestrator: route,
              assignmentDefault: route,
            },
          ],
        };
      if (method === 'modelPresetUpdate')
        return new Promise((resolve) => {
          finishOld = () => resolve({ preset: { id: 'preset' } });
        });
      throw Error(`Unexpected old method ${method}`);
    },
  };
  const replacement: ModelSettingsClient = {
    async call(method, args = {}) {
      if (method === 'modelCatalog')
        return {
          models: [{ ...route, providerName: 'DeepSeek', modelName: 'Model' }],
          default: route,
          defaultRevision: 1,
        };
      if (method === 'modelPresets')
        return {
          presets: [
            {
              id: 'preset',
              name: newName,
              revision: 1,
              orchestrator: route,
              assignmentDefault: route,
            },
          ],
        };
      if (method === 'modelPresetUpdate') {
        newWrites += 1;
        if (typeof args.name !== 'string') throw Error('name missing');
        newName = args.name;
        return { preset: { id: 'preset' } };
      }
      throw Error(`Unexpected replacement method ${method}`);
    },
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let current = old;
  const render = () =>
    root.render(
      createElement(RemoteHostModels, {
        hostId: 'same-host',
        client: current,
        t: (key) => Object.entries(en).find(([name]) => name === key)?.[1] ?? key,
      }),
    );
  const flush = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const preset = async () => {
    await act(async () => {
      const select = container.querySelector('select');
      if (!select) throw Error('scope missing');
      select.value = 'preset';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
  };
  const editAndSave = async (name: string) => {
    await act(() => {
      const input = container.querySelector('input');
      if (!input) throw Error('name missing');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, name);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      const save = [...container.querySelectorAll('button')].find(
        (button) => button.textContent === 'Save',
      );
      if (!save) throw Error('Save missing');
      save.click();
      await flush();
    });
  };
  try {
    await act(async () => {
      render();
      await flush();
    });
    await preset();
    await editAndSave('Old pending draft');
    expect(container.querySelector('input')?.disabled).toBe(true);
    current = replacement;
    await act(async () => {
      render();
      await flush();
    });
    expect(container.querySelector('select')?.value).toBe('');
    expect(container.querySelector('input')?.value).toBe('');
    expect(container.querySelector('input')?.disabled).toBe(false);
    await preset();
    expect(container.querySelector('input')?.value).toBe('New access preset');
    await act(async () => {
      finishOld();
      await flush();
    });
    expect(container.querySelector('input')?.value).toBe('New access preset');
    expect(container.querySelector('input')?.disabled).toBe(false);
    expect(newWrites).toBe(0);
    await editAndSave('New accepted draft');
    expect(newName).toBe('New accepted draft');
    expect(newWrites).toBe(1);
  } finally {
    await act(() => root.unmount());
    container.remove();
  }
});

it.each(['lost-reply', 'readback-failed'])(
  'does not resend a committed preset create after %s',
  async (mode) => {
    const route = { provider: 'deepseek', model: 'model' };
    let creates = 0;
    let created = false;
    let readFailure = false;
    const entry = (id: string) => ({
      id,
      name: 'New preset',
      revision: 1,
      orchestrator: route,
      assignmentDefault: route,
    });
    const client: ModelSettingsClient = {
      async call(method) {
        if (method === 'modelCatalog')
          return {
            models: [{ ...route, providerName: 'DeepSeek', modelName: 'Model' }],
            default: route,
            defaultRevision: 1,
          };
        if (method === 'modelPresets') {
          if (readFailure) throw Error('readback temporarily unavailable');
          return {
            presets: [
              entry('existing-same-name'),
              ...(created ? [entry('created-receipt-id')] : []),
            ],
          };
        }
        if (method === 'modelPresetCreate') {
          creates += 1;
          created = true;
          if (mode === 'lost-reply') throw Error('reply lost after commit');
          readFailure = true;
          return { preset: { id: 'created-receipt-id' } };
        }
        throw Error(`Unexpected method ${method}`);
      },
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const flush = async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    const button = (label: string) => {
      const found = [...container.querySelectorAll('button')].find(
        (item) => item.textContent === label,
      );
      if (!found) throw Error(`button missing: ${label}`);
      return found;
    };
    const release = hostSettingsDrafts.prompt('create-target', async () => 'save');
    try {
      await act(async () => {
        root.render(
          createElement(RemoteHostModels, {
            hostId: 'create-target',
            client,
            t: (key) => Object.entries(en).find(([name]) => name === key)?.[1] ?? key,
          }),
        );
        await flush();
      });
      await act(() => {
        const input = container.querySelector('input');
        if (!input) throw Error('name missing');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
          input,
          'New preset',
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        expect(await hostSettingsDrafts.prepare('create-target')).toBe(false);
      });
      expect(creates).toBe(1);
      expect(created).toBe(true);
      expect(container.querySelector('input')?.value).toBe('New preset');
      if (mode === 'lost-reply') {
        expect(container.textContent).toContain('Creation is unconfirmed');
        expect(button(en['modelPreset.saveAs']).disabled).toBe(true);
        await act(async () => {
          button(en['onboarding.refreshModels']).click();
          await flush();
        });
        expect(await hostSettingsDrafts.prepare('create-target')).toBe(false);
        expect(creates).toBe(1);
      } else {
        expect(button('Check saved preset').disabled).toBe(false);
        await act(async () => {
          button('Check saved preset').click();
          await flush();
        });
        expect(creates).toBe(1);
        readFailure = false;
        await act(async () => {
          button('Check saved preset').click();
          await flush();
        });
        expect(container.querySelector('input')?.value).toBe('');
        expect(await hostSettingsDrafts.prepare('create-target')).toBe(true);
        expect(creates).toBe(1);
      }
    } finally {
      release();
      await act(() => root.unmount());
      container.remove();
    }
  },
);
