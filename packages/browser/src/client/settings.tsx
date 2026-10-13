import { useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import { Menu, IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BrowserClientContext } from './index.js';
import { LOCALE_NS, type BrowserTranslate } from './locale.js';

interface TargetScope {
  getSnapshot(): {
    status: string;
    writable: boolean;
    value:
      | {
          target?: 'local' | 'container' | 'extension' | 'daily-control' | 'profile-control';
          localDriver?: 'current' | 'agent-browser';
          containerDriver?: 'current' | 'agent-browser';
        }
      | undefined;
  };
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<void>;
}

function ConfigChoice({
  scope,
  field,
  value,
  writable,
  title,
  items,
}: {
  scope: TargetScope;
  field: 'target' | 'localDriver' | 'containerDriver';
  value: string;
  writable: boolean;
  title: string;
  items: { id: string; label: string }[];
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <>
      <div className="bh-settings-row">
        <div className="bh-settings-row-text">
          <div className="bh-settings-row-title">{title}</div>
        </div>
        <Menu
          portal
          align="end"
          open={open}
          selectedId={value}
          items={items}
          onClose={() => setOpen(false)}
          onSelect={(id) => {
            setOpen(false);
            if (!items.some((item) => item.id === id)) return;
            setSaving(true);
            setError(undefined);
            void scope
              .set(field, id)
              .then(() => {
                if (scope.getSnapshot().value?.[field] !== id)
                  throw new Error('Browser setting was not saved');
              })
              .catch((cause: unknown) => setError(String(cause)))
              .finally(() => setSaving(false));
          }}
          anchor={
            <button
              type="button"
              className="bh-settings-selector"
              aria-haspopup="menu"
              aria-expanded={open}
              disabled={!writable || saving}
              onClick={() => setOpen(!open)}
            >
              {items.find((item) => item.id === value)?.label ?? value}
              <IconChevronDownOutlineRegular />
            </button>
          }
        />
      </div>
      {error === undefined ? null : (
        <div role="alert" className="bh-browser-error">
          {error}
        </div>
      )}
    </>
  );
}

export function BrowserTargetSettings({
  scope,
  t,
}: {
  scope: TargetScope;
  t: BrowserTranslate;
}): ReactElement {
  const store = useMemo(
    () => ({
      subscribe: (listener: () => void) => scope.subscribe(listener),
      getSnapshot: () => scope.getSnapshot(),
    }),
    [scope],
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const target = snapshot.value?.target ?? 'local';
  return (
    <div className="bh-settings-rows bh-browser-settings">
      <ConfigChoice
        scope={scope}
        field="target"
        value={target}
        writable={snapshot.writable}
        title={t('settings.target')}
        items={(
          ['local', 'container', 'extension', 'daily-control', 'profile-control'] as const
        ).map((id) => ({ id, label: t(`settings.${id}`) }))}
      />
      {target !== 'local' && target !== 'container' ? null : (
        <ConfigChoice
          scope={scope}
          field={target === 'container' ? 'containerDriver' : 'localDriver'}
          value={
            (target === 'container'
              ? snapshot.value?.containerDriver
              : snapshot.value?.localDriver) ?? 'current'
          }
          writable={snapshot.writable}
          title={t(target === 'container' ? 'settings.containerDriver' : 'settings.localDriver')}
          items={(['current', 'agent-browser'] as const).map((id) => ({
            id,
            label: t(`settings.driver.${id}`),
          }))}
        />
      )}
    </div>
  );
}

export function registerBrowserSettings(ctx: BrowserClientContext, t: BrowserTranslate): void {
  ctx.inject(['configForms', 'slots'], (settingsCtx) => {
    const native = settingsCtx as unknown as {
      configForms: { get(namespace: string): TargetScope };
      slots: {
        inject(name: string, callback: () => unknown): () => void;
        register(
          options: {
            name: string;
            id: string;
            order: number;
            label: () => string;
            locale: string;
            inject: () => { scope: TargetScope; t: BrowserTranslate };
          },
          component: typeof BrowserTargetSettings,
        ): () => void;
      };
    };
    const scope = native.configForms.get('botharness-browser');
    return native.slots.inject('botharness.settings.section', () =>
      native.slots.register(
        {
          name: 'botharness.settings.section',
          id: 'browser',
          order: 32,
          label: () => t('settings.section'),
          locale: LOCALE_NS,
          inject: () => ({ scope, t }),
        },
        BrowserTargetSettings,
      ),
    );
  });
}
