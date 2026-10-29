import { BUBBLE_SURFACES, readable } from './bot-name-color.js';
import { space } from './ds/tokens.stylex.js';
import { panelMaterials, validTargetId } from './appearance-panels.js';
import { appearanceMaterials } from './appearance-materials.js';
import {
  APPEARANCE_KEY,
  APPEARANCE_PRIMARY,
  Appearance,
  type AppearanceSnapshot,
} from './appearance.js';
import { NATIVE_LIGHT, NATIVE_DARK } from './appearance-native-tokens.js';
export const APPEARANCE_CLASS = 'bh-appearance-scope';
export function appearanceCss(snapshot: AppearanceSnapshot): string {
  const { config, mode } = snapshot;
  const selected = config.modes[mode];
  const primary = selected.primary ?? APPEARANCE_PRIMARY[selected.preset][mode];
  const materials = appearanceMaterials(selected, mode);
  const tokens: Record<string, string> = {
    ...NATIVE_LIGHT,
    ...(mode === 'dark' ? NATIVE_DARK : {}),
  };
  for (const part of ['header', 'body'] as const) {
    const material = materials[part];
    tokens[`--bh-global-${part}-fill`] =
      `color-mix(in srgb, ${material.color} ${material.opacity}%, transparent)`;
    tokens[`--bh-global-${part}-blur`] = `${material.blur}px`;
  }
  tokens['--dsw-alias-state-business-primary'] = primary;
  tokens['--dsw-alias-link'] = readable(primary, BUBBLE_SURFACES[mode].surface, 4.6);
  tokens['--dsw-alias-state-business-secondary'] =
    `color-mix(in srgb, ${primary} 45%, transparent)`;
  tokens['--dsw-alias-state-business-tertiary'] = `color-mix(in srgb, ${primary} 14%, transparent)`;
  tokens['--dsw-specific-sidebar-nav-item-active'] =
    `color-mix(in srgb, ${primary} 14%, transparent)`;
  return `.bh-root,.bh-workspace-mount[data-workspace-enabled],.${APPEARANCE_CLASS},[data-bh-appearance-owned]{color:var(--dsw-alias-label-primary);color-scheme:${mode};${Object.entries(
    tokens,
  )
    .map(([k, v]) => `${k}:${v}`)
    .join(
      ';',
    )}}:root [data-bh-appearance-owned][data-menu-material],:root .${APPEARANCE_CLASS}[data-menu-material],:root .${APPEARANCE_CLASS} [data-menu-material]{--dsw-elevation-stroke-color:var(--dsw-alias-border-${mode === 'dark' ? 'l3' : 'l4'})}${materialCss()}${panelCss(snapshot)}`;
}

export function mountAppearance(owner: Appearance): () => void {
  const style = document.createElement('style');
  style.dataset.plugin = '@botharness/ui';
  style.dataset.pluginCss = '@botharness/ui/appearance';
  const update = () => {
    style.textContent = appearanceCss(owner.getSnapshot());
    style.dataset.bhAppearance = owner.getSnapshot().mode;
  };
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onStorage = (event: StorageEvent) => {
    if (event.key === APPEARANCE_KEY || event.key === null) owner.refresh();
  };
  update();
  document.head.appendChild(style);
  const off = owner.subscribe(update);
  media.addEventListener('change', owner.refresh);
  window.addEventListener('storage', onStorage);
  return () => {
    off();
    style.remove();
    media.removeEventListener('change', owner.refresh);
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

function panelCss({ config, mode }: AppearanceSnapshot): string {
  return Object.keys(config.modes[mode].panels ?? {})
    .filter(validTargetId)
    .map((id) => {
      const material = panelMaterials(config.modes[mode], mode, id);
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
