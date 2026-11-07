export const GENUI_APPEARANCE_TOKENS = Object.freeze({
  light: Object.freeze({
    background: '#f5f5f5',
    foreground: '#202124',
    muted: '#62666d',
    surface: '#ffffff',
    well: '#ededee',
    selection: '#e5edff',
    primary: '#245bd6',
    primaryForeground: '#ffffff',
    axis: '#777c85',
    chart: Object.freeze([
      '#245bd6',
      '#007d70',
      '#ad5100',
      '#8546b5',
      '#c02f60',
      '#687500',
      '#007b9c',
      '#915934',
    ]),
  }),
  dark: Object.freeze({
    background: '#18191b',
    foreground: '#eeeeef',
    muted: '#abaeb5',
    surface: '#24262a',
    well: '#1c1e21',
    selection: '#283d64',
    primary: '#93b4ff',
    primaryForeground: '#17284a',
    axis: '#969ba5',
    chart: Object.freeze([
      '#93b4ff',
      '#60d4ba',
      '#ffb265',
      '#cf9cf4',
      '#ff8fb3',
      '#c8d775',
      '#69cee9',
      '#d9ad8e',
    ]),
  }),
});

const { light, dark } = GENUI_APPEARANCE_TOKENS;

export const GENUI_DEFAULT_CSS = `@layer genui-default {
  :root {
    --background:light-dark(${light.background},${dark.background});
    --foreground:light-dark(${light.foreground},${dark.foreground});
    --muted:light-dark(${light.muted},${dark.muted});
    --surface:light-dark(${light.surface},${dark.surface});
    --card:var(--surface);
    --well:light-dark(${light.well},${dark.well});
    --selection:light-dark(${light.selection},${dark.selection});
    --accent:var(--primary);
    --accent-foreground:var(--primary-foreground);
    --primary:light-dark(${light.primary},${dark.primary});
    --primary-foreground:light-dark(${light.primaryForeground},${dark.primaryForeground});
    --axis:light-dark(${light.axis},${dark.axis});
    --border:var(--axis);
    ${light.chart.map((value, index) => `--chart-${index + 1}:light-dark(${value},${dark.chart[index]});`).join('\n    ')}
    --radius-xs:4px;
    --radius-sm:8px;
    --radius-md:12px;
    --radius-lg:16px;
    --radius:var(--radius-sm);
    --space-1:2px;
    --space-2:4px;
    --space-3:8px;
    --space-4:12px;
    --space-5:16px;
    --space-6:24px;
    --font-sans:system-ui,sans-serif;
  }
  :where(*) { box-sizing:border-box }
  :where(html,body) { margin:0; min-height:0 }
  :where(html) { font-family:var(--font-sans) }
  :where(body) { color:var(--foreground); background:var(--background); overflow-wrap:anywhere }
  :where(button,input,select,textarea) { font:inherit; accent-color:var(--primary) }
  :where(:focus-visible) { outline:2px solid var(--primary); outline-offset:2px }
  :where(.genui-surface,.genui-well,.genui-selection) { border:0; border-radius:var(--radius); padding:var(--space-5) }
  :where(.genui-surface) { background:var(--surface) }
  :where(.genui-well) { background:var(--well) }
  :where(.genui-selection) { background:var(--selection) }
  :where(.genui-grid) { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr)); gap:var(--space-5) }
  :where(.genui-table) { width:100%; border-collapse:separate; border-spacing:0 var(--space-2); text-align:left }
  :where(.genui-table tr,.genui-table th,.genui-table td) { border:0 }
  :where(.genui-table th,.genui-table td) { padding:var(--space-3) var(--space-4) }
  :where(.genui-table thead,.genui-table tbody tr:nth-child(even)) { background:var(--well) }
  :where(.genui-table tr[aria-selected="true"]) { background:var(--selection) }
  :where(.genui-table tr:focus-within) { background:var(--selection) }
  :where(.genui-series) { --series-color:var(--chart-1); color:var(--series-color) }
  ${light.chart.map((_, index) => `:where(.genui-series[data-series="${index + 1}"]) { --series-color:var(--chart-${index + 1}) }`).join('\n  ')}
  :where(.genui-legend) { display:flex; flex-wrap:wrap; gap:var(--space-3) var(--space-5); margin-block:var(--space-3); padding:0; list-style:none }
  :where(.genui-axis) { fill:none; stroke:var(--axis); stroke-width:1 }
  :where(.pele) {
    --pele-bg:var(--background);
    --pele-fg:var(--foreground);
    --pele-muted:var(--muted);
    --pele-surface:var(--well);
    --pele-surface-alt:var(--surface);
    --pele-border:var(--axis);
    --pele-line:var(--axis);
    --pele-accent:var(--primary);
    --pele-font:var(--font-sans);
    --pele-radius:var(--radius);
    ${light.chart.map((_, index) => `--pele-series-${index + 1}:var(--chart-${index + 1});`).join('\n    ')}
  }
  :where(.pele-flowchart) { --pele-border:transparent }
}`;

export const GENUI_STYLE_GUIDANCE =
  'Use the shared CSS variables for color, spacing and radius; never add ad hoc hex colors. ' +
  'Group content with borderless genui-surface cards, recessed genui-well blocks and genui-selection accents, not decorative borders. ' +
  'Use genui-grid, genui-table and genui-legend for layout; retain meaningful graph/axis lines and keyboard focus-visible cues. ' +
  'Assign stable categories to distinct --chart-1 through --chart-8 colors (genui-series with data-series="1" through "8" exposes --series-color); never use same-primary shades for categories. ' +
  'Label chart values and legends and pair colors with line dashes, marker shapes or numbered sectors so color is not the only cue. ' +
  'Tokens follow the root color-scheme in both themes; author typography and CSS remain customizable.';
