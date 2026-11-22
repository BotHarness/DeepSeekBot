import { space } from './ds/tokens.stylex.js';
import { panelMaterials, validTargetId } from './appearance-panels.js';
import { appearanceMaterials, type MaterialLayers } from './appearance-materials.js';
import { APPEARANCE_KEY, type Appearance, type AppearanceSnapshot } from './appearance.js';
import { tobsTokens } from './tobs-theme.js';
export const APPEARANCE_CLASS = 'bh-appearance-scope';
const OWNED_SCOPE = `.bh-root,.bh-workspace-mount[data-workspace-enabled],.${APPEARANCE_CLASS},[data-bh-appearance-owned]`;
const WALLPAPER_INK = [
  ['--tobs-ink-secondary', 40],
  ['--tobs-ink-tertiary', 35],
  ['--tobs-ink-quiet', 30],
] as const;
export function appearanceCss(snapshot: AppearanceSnapshot): string {
  const { config, mode } = snapshot;
  const selected = config.modes[mode];
  const tokens = tobsTokens(mode, selected.preset, selected.primary, config.style);
  const materials = appearanceMaterials(selected, mode, tokens);
  const owned: Record<string, string> = { color: 'var(--tobs-ink-primary)', 'color-scheme': mode };
  if (mode === 'light')
    for (const [token, share] of WALLPAPER_INK)
      owned[token] =
        `color-mix(in srgb, ${tokens['--tobs-ink-primary']} calc(var(--bh-wallpaper-ink, 0) * ${share}%), ${tokens[token]})`;
  for (const part of ['header', 'body'] as const) {
    const material = materials[part];
    owned[`--bh-global-${part}-fill`] =
      `color-mix(in srgb, ${material.color} ${material.opacity}%, transparent)`;
    owned[`--bh-global-${part}-blur`] = `${material.blur}px`;
  }
  return `body,${OWNED_SCOPE}{${declarations(tokens)}}${OWNED_SCOPE}{${declarations(owned)}}${materialCss()}${panelCss(snapshot, tokens)}`;
}

function declarations(properties: Record<string, string>): string {
  return Object.entries(properties)
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
}

export function mountAppearance(owner: Appearance): () => void {
  const style = document.createElement('style');
  style.dataset.plugin = '@botharness/ui';
  style.dataset.pluginCss = '@botharness/ui/appearance';
  const update = () => {
    style.textContent = appearanceCss(owner.getSnapshot());
    style.dataset.bhAppearance = owner.getSnapshot().mode;
    document.documentElement.dataset.bhAppearance = owner.getSnapshot().mode;
    document.documentElement.dataset.tobsStyle = owner.getSnapshot().config.style ?? 'a';
  };
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const onStorage = (event: StorageEvent) => {
    if (event.key === APPEARANCE_KEY || event.key === null) owner.refresh();
  };
  update();
  document.head.appendChild(style);
  const off = owner.subscribe(update);
  media?.addEventListener('change', owner.refresh);
  window.addEventListener('storage', onStorage);
  return () => {
    off();
    style.remove();
    delete document.documentElement.dataset.bhAppearance;
    delete document.documentElement.dataset.tobsStyle;
    media?.removeEventListener('change', owner.refresh);
    window.removeEventListener('storage', onStorage);
  };
}

function materialCss(): string {
  const scope = ':root .bh-workspace-mount[data-workspace-enabled]';
  return `
${scope} .bh-dock-theme { --dv-group-view-background-color:transparent; --dv-tabs-and-actions-container-background-color:transparent; --dv-activegroup-visiblepanel-tab-background-color:transparent; --dv-inactivegroup-visiblepanel-tab-background-color:transparent; --dv-activegroup-hiddenpanel-tab-background-color:transparent; --dv-inactivegroup-hiddenpanel-tab-background-color:transparent; }
${scope} .bh-root, ${scope} .bh-workspace-rail { background:transparent; }
${scope} .dv-tabs-and-actions-container, ${scope} .bh-channel-session-header { background:var(--bh-global-header-fill); backdrop-filter:blur(var(--bh-global-header-blur)); }
${scope} [data-appearance-header] { background:var(--bh-global-header-fill); backdrop-filter:blur(var(--bh-global-header-blur)); }
${scope} .bh-channel-subpanel-body { display:flex; flex-direction:column; flex:1; min-height:0; min-width:0; overflow:auto; }
${scope} .bh-channel-subpanel-body > section { flex:1; min-height:0; }
${scope} .bh-memory-commit-view { display:flex; flex-direction:column; padding:0; }
${scope} .bh-memory-commit-header { margin:0; flex-shrink:0; }
${scope} .bh-memory-detail-body { flex:1; padding:${space.x3} ${space.x4}; }
${scope} [data-appearance-body], ${scope} .dv-content-container { background:var(--bh-global-body-fill); backdrop-filter:blur(var(--bh-global-body-blur)); }
`;
}

function panelCss({ config, mode }: AppearanceSnapshot, layers: MaterialLayers): string {
  return Object.keys(config.modes[mode].panels ?? {})
    .filter(validTargetId)
    .map((id) => {
      const material = panelMaterials(config.modes[mode], mode, id, layers);
      const scope = `:root .bh-workspace-mount[data-workspace-enabled] .dv-groupview:has(> .dv-tabs-and-actions-container .dv-active-tab [data-dock-header="${id.slice(5)}"])`;
      return (['header', 'body'] as const)
        .map(
          (part) =>
            `${scope} > ${part === 'header' ? '.dv-tabs-and-actions-container' : '.dv-content-container'}, :root .bh-workspace-mount[data-workspace-enabled] [data-appearance-${part}="${id.slice(5)}"] { background:color-mix(in srgb, ${material[part].color} ${material[part].opacity}%, transparent); backdrop-filter:blur(${material[part].blur}px); }`,
        )
        .join('');
    })
    .join('');
}
