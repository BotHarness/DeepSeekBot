import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSource, walk } from '../check-ui-rules.mjs';
import { desktopXstyleShorthand } from '../ui-rule-xstyle.mjs';

const feature = 'packages/client/src/client/feature.tsx';
const scan = (source, root = tmpdir()) =>
  desktopXstyleShorthand(feature, parseSource(source, feature), walk, {
    root,
    parse: parseSource,
  }).map(({ text }) => text);

describe('xstyle spacing shorthand', () => {
  it('rejects padding and margin shorthands passed to a primitive through xstyle', () => {
    const source = `
const styles = stylex.create({
  summary: { padding: 0, gap: space.x3 },
  row: { margin: 0 },
  plain: { padding: 0 },
});
const view = <><Button xstyle={styles.summary} /><Button xstyle={[styles.base, open && styles.row]} /><div {...stylex.props(styles.plain)} /></>;
`;
    expect(scan(source)).toEqual(['styles.summary padding', 'styles.row margin']);
  });

  it('accepts longhand resets', () => {
    const source = `
const styles = stylex.create({ summary: { paddingBlock: 0, paddingInline: 0 } });
const view = <Button xstyle={styles.summary} />;
`;
    expect(scan(source)).toEqual([]);
  });

  it('follows a style sheet imported from a sibling module', () => {
    const root = mkdtempSync(join(tmpdir(), 'ui-rule-xstyle-'));
    mkdirSync(join(root, 'packages/client/src/client/ds'), { recursive: true });
    writeFileSync(
      join(root, 'packages/client/src/client/ds/request-card.tsx'),
      'export const requestCardStyles = stylex.create({ summary: { padding: 0 } });\n',
    );
    const source = `
import { requestCardStyles as styles } from './ds/request-card.js';
const view = <Button xstyle={styles.summary} />;
`;
    expect(scan(source, root)).toEqual(['styles.summary padding']);
  });
});
