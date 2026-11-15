import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Checkbox } from '@deepseek-ai/dsh-client-ui-primitives';

import { loadModelCatalog, type BridgeCall } from './bridge.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { color, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { modelChoices } from './team-usage.js';
import type { RoleModels } from './team-roles-bridge.js';

const styles = stylex.create({
  group: { display: 'flex', flexDirection: 'column', gap: space.x2, minWidth: 0 },
  fieldset: { borderWidth: 0, padding: 0, margin: 0, minWidth: 0 },
  title: {
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
    padding: 0,
  },
  checks: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
});

type Catalog =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; models: readonly { route: string; label: string }[] };

export function RoleModelsField({
  call,
  t,
  value,
  disabled,
  onChange,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  value: RoleModels;
  disabled: boolean;
  onChange(next: RoleModels): void;
}): ReactElement {
  const [catalog, setCatalog] = useState<Catalog>({ state: 'loading' });
  const mount = useMountedResource<HTMLFieldSetElement>(() => {
    let live = true;
    loadModelCatalog(call)
      .then((view) => {
        if (live) setCatalog({ state: 'ready', models: modelChoices(view.models) });
      })
      .catch(() => {
        if (live) setCatalog({ state: 'failed' });
      });
    return () => {
      live = false;
    };
  }, [call]);
  const routes = value.kind === 'only' ? value.routes : [];
  const toggle = (route: string, on: boolean): void => {
    const next = new Set(routes);
    if (on) next.add(route);
    else next.delete(route);
    onChange({ kind: 'only', routes: [...next] });
  };
  const listed = catalog.state === 'ready' ? catalog.models : [];
  const extra = routes
    .filter((route) => !listed.some((model) => model.route === route))
    .map((route) => ({ route, label: route }));
  return (
    <fieldset ref={mount} {...stylex.props(styles.group, styles.fieldset)} data-role-models="">
      <legend {...stylex.props(styles.title)}>{t('team.roles.models')}</legend>
      <Select
        label={t('team.roles.models')}
        value={value.kind}
        disabled={disabled}
        options={[
          { value: 'all', label: t('team.roles.modelsAll') },
          { value: 'only', label: t('team.roles.modelsOnly') },
        ]}
        onChange={(kind) => onChange(kind === 'all' ? { kind: 'all' } : { kind: 'only', routes })}
      />
      {value.kind === 'all' ? null : catalog.state === 'loading' ? (
        <Note>{t('team.roles.modelsLoading')}</Note>
      ) : catalog.state === 'failed' ? (
        <Note tone="danger">{t('team.roles.modelsFailed')}</Note>
      ) : (
        <div {...stylex.props(styles.checks)}>
          {[...listed, ...extra].map((model) => (
            <div key={model.route} data-role-model={model.route}>
              <Checkbox
                label={model.label}
                checked={routes.includes(model.route)}
                disabled={disabled}
                onChange={(checked) => toggle(model.route, checked)}
              />
            </div>
          ))}
          {routes.length === 0 ? <Note tone="warning">{t('team.roles.modelsNone')}</Note> : null}
        </div>
      )}
    </fieldset>
  );
}
