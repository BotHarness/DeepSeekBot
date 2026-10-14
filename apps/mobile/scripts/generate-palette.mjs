import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = new URL('../../../', import.meta.url);
const OUTPUT = fileURLToPath(new URL('apps/mobile/src/ui/design/palette.generated.ts', root));

export const ROLES = {
  fg: 'alias-label-primary',
  muted: 'alias-label-secondary',
  subtle: 'alias-label-tertiary',
  divider: 'alias-border-l1',
  border: 'alias-border-l2',
  borderStrong: 'alias-border-l3',
  hover: 'alias-interactive-bg-hover',
  selected: 'alias-interactive-bg-active',
  accent: 'alias-state-business-primary',
  onAccent: 'alias-label-primary-foreground',
  danger: 'alias-state-error-primary',
  onDanger: 'alias-label-primary-foreground',
  dangerEdge: 'alias-state-error-secondary',
  dangerSoft: 'alias-interactive-bg-hover-danger',
  warning: 'alias-state-warn-primary',
  warningEdge: 'alias-state-warn-secondary',
  warningSoft: 'alias-state-warn-tertiary',
  success: 'alias-state-success-primary',
  surface: 'alias-bg-module-platform',
  elevated: 'alias-button-elevated-fill',
  base: 'alias-bg-base',
};

function themeSource() {
  const require = createRequire(new URL('packages/client/package.json', root));
  return readFileSync(require.resolve('@deepseek-ai/dsh-client-ui-theme/client'), 'utf8');
}

function themeVersion() {
  const require = createRequire(new URL('packages/client/package.json', root));
  const pkg = require('@deepseek-ai/dsh-client-ui-theme/package.json');
  return pkg.version;
}

function declarations(source) {
  const light = new Map();
  const dark = new Map();
  for (const match of source.matchAll(/(?<=^|[}"])\s*([^{}"]+?)\{([^{}]*--dsw-[^{}]*)\}/g)) {
    const selector = match[1].trim();
    const target =
      selector === ':root' || selector === 'body'
        ? light
        : selector === 'body[data-ds-dark-theme]'
          ? dark
          : undefined;
    if (target === undefined) continue;
    for (const decl of match[2].split(';')) {
      const colon = decl.indexOf(':');
      if (colon < 0) continue;
      const name = decl.slice(0, colon).trim();
      if (name.startsWith('--dsw-')) target.set(name, decl.slice(colon + 1).trim());
    }
  }
  return { light, dark: new Map([...light, ...dark]) };
}

function resolve(vars, value, depth = 0) {
  if (depth > 20) throw new Error(`Cyclic DSH token: ${value}`);
  return value.replace(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/g, (_, name, fallback) => {
    const next = vars.get(name) ?? fallback;
    if (next === undefined) throw new Error(`Unknown DSH token ${name}`);
    return resolve(vars, next.trim(), depth + 1);
  });
}

export function palette(source = themeSource()) {
  const scopes = declarations(source);
  const result = {};
  for (const scheme of ['light', 'dark']) {
    const vars = scopes[scheme];
    result[scheme] = Object.fromEntries(
      Object.entries(ROLES).map(([role, token]) => {
        const value = vars.get(`--dsw-${token}`);
        if (value === undefined) throw new Error(`DSH has no --dsw-${token} for ${scheme}`);
        return [role, resolve(vars, value).toLowerCase()];
      }),
    );
  }
  return result;
}

export function render(colors = palette(), version = themeVersion()) {
  const block = (scheme) =>
    Object.entries(colors[scheme])
      .map(([role, value]) => `    ${role}: '${value}',`)
      .join('\n');
  return `export const paletteSource = '@deepseek-ai/dsh-client-ui-theme@${version}';

export const palette = {
  light: {
${block('light')}
  },
  dark: {
${block('dark')}
  },
} as const;
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const next = render();
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(OUTPUT, 'utf8');
    } catch {}
    if (current !== next) {
      console.error('palette.generated.ts is stale; run the generator without --check.');
      process.exit(1);
    }
  } else {
    writeFileSync(OUTPUT, next);
  }
}
