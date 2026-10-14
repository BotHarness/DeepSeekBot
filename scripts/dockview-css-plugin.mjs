import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import postcss from 'postcss';

export const DOCKVIEW_CSS_PLACEHOLDER = '@bh-dockview-css';

const THEMED = /\.dockview-theme-|\.dockview-spaced\b|\.dv-debug\b/;

export function dockviewStructuralCss(rootDir) {
  const require = createRequire(join(rootDir, 'packages/client/package.json'));
  const source = readFileSync(require.resolve('dockview-react/dist/styles/dockview.css'), 'utf8');
  const root = postcss.parse(source);
  root.walkRules((rule) => {
    const selectors = rule.selectors.filter((selector) => !THEMED.test(selector));
    if (selectors.length === 0) rule.remove();
    else rule.selectors = selectors;
  });
  root.walkAtRules((atRule) => {
    if (atRule.nodes !== undefined && atRule.nodes.length === 0) atRule.remove();
  });
  root.walkComments((comment) => comment.remove());
  return root.toString();
}

export function dockviewCssPlugin({ rootDir }) {
  let css;
  return {
    name: 'botharness:dockview-css',
    renderChunk(code) {
      const at = code.indexOf(DOCKVIEW_CSS_PLACEHOLDER);
      if (at < 0) return null;
      css ??= `\n${dockviewStructuralCss(rootDir)}\n`;
      const quote = code[at - 1];
      const end = at + DOCKVIEW_CSS_PLACEHOLDER.length;
      const literal = (quote === '"' || quote === "'") && code[end] === quote;
      const replacement = literal
        ? JSON.stringify(css)
        : css.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${');
      const from = literal ? at - 1 : at;
      const to = literal ? end + 1 : end;
      return { code: code.slice(0, from) + replacement + code.slice(to), map: null };
    },
  };
}
