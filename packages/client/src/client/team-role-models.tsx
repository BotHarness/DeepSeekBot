import { useId, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { providerBrand } from '@botharness/host-client/shared/model-brand';
import type { ModelProvidersView } from '@botharness/host-client/model-providers';
import { bridgeHost, loadModelCatalog, type BridgeCall } from './bridge.js';
import { Button } from './ds/button.js';
import { Checkbox } from './ds/checkbox.js';
import { Icon } from './ds/icon.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { ink, layer, space, style } from './ds/tobs.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { ModelBrandIcon } from './model-brand.js';
import { useMountedResource } from './mounted-resource.js';
import {
  canManage,
  loadModelsAllowed,
  routeKey,
  type GrantingViewer,
  type RoleModels,
} from './team-roles-bridge.js';

const styles = stylex.create({
  group: { display: 'flex', flexDirection: 'column', gap: space.x2, minWidth: 0 },
  fieldset: { borderWidth: 0, padding: 0, margin: 0, minWidth: 0 },
  title: {
    color: ink.secondary,
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    padding: 0,
  },
  provider: { backgroundColor: layer.well, borderRadius: style.radiusControl },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    minWidth: 0,
    paddingInline: space.x3,
    paddingBlock: space.x1,
  },
  disclosure: { marginInlineStart: 'auto', paddingInline: space.x2 },
  routes: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    paddingInlineStart: space.x8,
    paddingInlineEnd: space.x3,
    paddingBlockEnd: space.x3,
  },
});

type Provider = { id: string; name: string; models: Map<string, string> };
type Catalog =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; providers: readonly Provider[]; allowed: RoleModels };

function roleProviders(
  known: readonly { id: string; name: string }[],
  entries: readonly { provider: string; providerName: string; model: string; modelName: string }[],
  grants: readonly RoleModels[],
): Provider[] {
  const providers = new Map<string, Provider>();
  const get = (id: string, name = id) => {
    const found = providers.get(id);
    if (found !== undefined) return found;
    const provider: Provider = { id, name, models: new Map() };
    providers.set(id, provider);
    return provider;
  };
  for (const { id, name } of known) get(id, name);
  for (const entry of entries)
    get(entry.provider, entry.providerName).models.set(entry.model, entry.modelName);
  for (const grant of grants) {
    if (grant.kind === 'all') continue;
    for (const provider of grant.providers) get(provider);
    for (const route of grant.routes) {
      const separator = route.indexOf('/');
      const model = route.slice(separator + 1);
      const models = get(route.slice(0, separator)).models;
      if (!models.has(model)) models.set(model, model);
    }
  }
  return [...providers.values()];
}

function toggled(values: readonly string[], value: string, checked: boolean): string[] {
  return checked ? [...new Set([...values, value])] : values.filter((entry) => entry !== value);
}

export function RoleModelsField({
  call,
  t,
  viewer,
  value,
  disabled,
  onChange,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  viewer: GrantingViewer;
  value: RoleModels;
  disabled: boolean;
  onChange(next: RoleModels): void;
}): ReactElement {
  const id = useId();
  const [catalog, setCatalog] = useState<Catalog>({ state: 'loading' });
  const [expanded, setExpanded] = useState<readonly string[]>([]);
  const canReadProviders = canManage(viewer, 'modelSources.manage');
  const mount = useMountedResource<HTMLFieldSetElement>(() => {
    const request = new AbortController();
    const inventory = canReadProviders
      ? bridgeHost(call, request.signal)
          .call<ModelProvidersView>('modelProviders')
          .then((view) => view.providers)
          .catch(() => [])
      : [];
    Promise.all([
      inventory,
      loadModelCatalog(call),
      viewer.owner ? { kind: 'all' as const } : loadModelsAllowed(call, request.signal),
    ])
      .then(([known, view, allowed]) => {
        if (!request.signal.aborted)
          setCatalog({
            state: 'ready',
            providers: roleProviders(known, view.models, [allowed]),
            allowed,
          });
      })
      .catch(() => {
        if (!request.signal.aborted) setCatalog({ state: 'failed' });
      });
    return () => request.abort();
  }, [call, canReadProviders, viewer.owner]);
  const providers = value.kind === 'only' ? value.providers : [];
  const routes = value.kind === 'only' ? value.routes : [];
  const listed = catalog.state === 'ready' ? catalog.providers : [];
  const visible = new Map(listed.map((provider) => [provider.id, provider]));
  for (const provider of roleProviders([], [], [value])) {
    const known = visible.get(provider.id);
    visible.set(
      provider.id,
      known === undefined
        ? provider
        : { ...known, models: new Map([...provider.models, ...known.models]) },
    );
  }
  const canGrantAll = viewer.owner || (catalog.state === 'ready' && catalog.allowed.kind === 'all');
  return (
    <fieldset ref={mount} {...stylex.props(styles.group, styles.fieldset)} data-role-models="">
      <legend {...stylex.props(styles.title)}>{t('team.roles.models')}</legend>
      <Select
        label={t('team.roles.models')}
        value={value.kind}
        disabled={disabled}
        options={[
          ...(canGrantAll || value.kind === 'all'
            ? [{ value: 'all' as const, label: t('team.roles.modelsAll') }]
            : []),
          { value: 'only', label: t('team.roles.modelsOnly') },
        ]}
        onChange={(kind) =>
          onChange(kind === 'all' ? { kind: 'all' } : { kind: 'only', providers, routes })
        }
      />
      {value.kind === 'all' ? null : catalog.state === 'loading' ? (
        <Note>{t('team.roles.modelsLoading')}</Note>
      ) : catalog.state === 'failed' ? (
        <Note tone="danger">{t('team.roles.modelsFailed')}</Note>
      ) : (
        <>
          <Note>{t('team.roles.modelsProvider')}</Note>
          {[...visible.values()].map((provider) => {
            const checked = providers.includes(provider.id);
            const open = expanded.includes(provider.id);
            const modelsId = `${id}-${provider.id}`;
            const allowed = catalog.allowed;
            const grantProvider = allowed.kind === 'all' || allowed.providers.includes(provider.id);
            return (
              <div key={provider.id} {...stylex.props(styles.provider)}>
                <div {...stylex.props(styles.row)}>
                  <ModelBrandIcon brand={providerBrand(provider.id, provider.name)} size={20} />
                  <Checkbox
                    label={provider.name}
                    title={t('team.roles.modelsProvider')}
                    checked={checked}
                    disabled={disabled || (!grantProvider && !checked)}
                    onChange={(next) =>
                      onChange({
                        kind: 'only',
                        providers: toggled(providers, provider.id, next),
                        routes,
                      })
                    }
                  />
                  {provider.models.size === 0 ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      xstyle={styles.disclosure}
                      aria-label={t('team.roles.modelsDisclosure', { name: provider.name })}
                      aria-expanded={open}
                      aria-controls={modelsId}
                      icon={<Icon name={open ? 'chevron-down' : 'chevron-right'} />}
                      onClick={() => setExpanded(toggled(expanded, provider.id, !open))}
                    />
                  )}
                </div>
                {open ? (
                  <div id={modelsId} {...stylex.props(styles.routes)}>
                    {[...provider.models].map(([model, label]) => {
                      const route = routeKey(provider.id, model);
                      const selected = routes.includes(route);
                      const grantRoute =
                        grantProvider ||
                        (allowed.kind === 'only' && allowed.routes.includes(route));
                      return (
                        <div key={route} data-role-model={route}>
                          <Checkbox
                            label={label}
                            checked={checked || selected}
                            disabled={disabled || checked || (!grantRoute && !selected)}
                            onChange={(next) =>
                              onChange({
                                kind: 'only',
                                providers,
                                routes: toggled(routes, route, next),
                              })
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
          {providers.length + routes.length === 0 ? (
            <Note tone="warning">{t('team.roles.modelsNone')}</Note>
          ) : null}
        </>
      )}
      <Note>{t('team.roles.modelsServerCheck')}</Note>
    </fieldset>
  );
}
