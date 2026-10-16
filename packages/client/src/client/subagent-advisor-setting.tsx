import { useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Input, Switch } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import { errorMessage, type SubagentAdvisorView } from './bridge.js';
import { Note } from './ds/note.js';
import { SettingsRow } from './ds/settings-row.js';
import { color, space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import type { ClientStore } from './store.js';

const styles = stylex.create({
  links: { display: 'flex', flexWrap: 'wrap', columnGap: space.x3 },
  link: { color: color.accent, textDecoration: { default: 'none', ':hover': 'underline' } },
  key: { boxSizing: 'border-box', width: '240px', maxWidth: '100%', minWidth: 0 },
});

type Props = {
  actions: Pick<
    BridgeActions,
    'subagentAdvisor' | 'setSubagentAdvisorEnabled' | 'setSubagentAdvisorKey'
  >;
  t: BotHarnessTranslate;
};

export function SubagentAdvisorSetting({
  store,
  ...props
}: Props & { store: ClientStore }): ReactElement | null {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const selection = state.selection;
  const slug =
    selection?.kind === 'bot'
      ? selection.slug
      : selection?.kind === 'channel'
        ? state.channels.find((channel) => channel.id === selection.channelId)?.botSlug
        : undefined;
  return slug === undefined ? null : <AdvisorSetting key={slug} slug={slug} {...props} />;
}

function AdvisorSetting({ actions, slug, t }: Props & { slug: string }): ReactElement {
  const [view, setView] = useState<SubagentAdvisorView>();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    void actions
      .subagentAdvisor(slug)
      .then((next) => {
        if (active) setView(next);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, [actions, slug]);
  const save = async (enabled?: boolean): Promise<void> => {
    if (busy || view === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      setView(
        enabled === undefined
          ? await actions.setSubagentAdvisorKey(slug, draft.trim())
          : await actions.setSubagentAdvisorEnabled(slug, enabled),
      );
      if (enabled === undefined) setDraft('');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SettingsRow
        rootRef={mount}
        data={{ 'data-subagent-advisor-setting': '' }}
        title={t('subagentAdvisor.row.title')}
        description={
          <>
            {t('subagentAdvisor.row.description')}
            <span {...stylex.props(styles.links)}>
              <a
                {...stylex.props(styles.link)}
                href="https://opencode.ai"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('subagentAdvisor.getKey')}
              </a>
              <a
                {...stylex.props(styles.link)}
                href="https://github.com/ZhiweiWei-NAMI/dsh-auto"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('subagentAdvisor.dshAuto')}
              </a>
            </span>
          </>
        }
        control={
          view === undefined ? null : (
            <Switch
              checked={view.enabled}
              onChange={(enabled) => void save(enabled)}
              disabled={busy}
              label={t('subagentAdvisor.row.title')}
            />
          )
        }
      >
        {view === undefined && error === undefined ? (
          <Note tone="muted">{t('subagentAdvisor.loading')}</Note>
        ) : null}
        {error === undefined ? null : <Note tone="danger">{error}</Note>}
      </SettingsRow>
      {view?.enabled ? (
        <SettingsRow
          title={
            <label htmlFor={`bh-subagent-advisor-key-${slug}`}>
              {t('subagentAdvisor.key.label')}
            </label>
          }
          description={t(
            view.keyConfigured ? 'subagentAdvisor.key.configured' : 'subagentAdvisor.key.hint',
          )}
          control={
            <Input
              className={stylex.props(styles.key).className ?? ''}
              id={`bh-subagent-advisor-key-${slug}`}
              type="password"
              autoComplete="new-password"
              placeholder={t('subagentAdvisor.key.placeholder')}
              value={draft}
              disabled={busy}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => {
                if (draft.trim()) void save();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing && draft.trim())
                  void save();
              }}
            />
          }
        />
      ) : null}
    </>
  );
}
