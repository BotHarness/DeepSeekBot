import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  productCounts,
  type ImportableSession,
  type ImportProduct,
} from '@botharness/host-client/session-bot';
import { Icon } from './ds/icon.js';
import { dimension } from './ds/dimensions.stylex.js';
import { Button } from './ds/button.js';
import { border, color, radius, size, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { styles as stepStyles } from './bot-intro-step-styles.js';

export const IMPORT_SOURCES = [
  'claude-code',
  'codex',
  'claude',
  'chatgpt',
  'grok',
  'cursor',
  'other',
] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

const ICONS: Readonly<Record<ImportSource, string>> = {
  'claude-code': 'terminal',
  codex: 'cpu',
  claude: 'message-square',
  chatgpt: 'messages-square',
  grok: 'zap',
  cursor: 'keyboard',
  other: 'puzzle',
};

const LOCAL: Partial<Record<ImportSource, Exclude<ImportProduct, 'deepseek'>>> = {
  'claude-code': 'claude-code',
  codex: 'codex',
};

const WEB: readonly ImportSource[] = ['claude', 'chatgpt', 'grok'];

const styles = stylex.create({
  grid: {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fit, minmax(${dimension.introToolCardMinWidth}, 1fr))`,
    gap: space.x3,
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    padding: space.x4,
    borderWidth: 0,
    borderRadius: radius.lg,
    backgroundColor: { default: color.surface, ':hover': color.hover },
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    textAlign: 'start',
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
  },
  chosen: { backgroundColor: { default: color.accentTint, ':hover': color.accentTint } },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: size.nav,
    height: size.nav,
    borderRadius: radius.md,
    backgroundColor: color.modal,
    color: color.fg,
  },
  chosenIcon: { backgroundColor: color.accent, color: color.onAccent },
  label: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  strong: { fontWeight: text.strong },
  meta: { color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
  found: { color: color.accent },
  result: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x3,
    padding: space.x4,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  resultCopy: {
    margin: 0,
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    flexGrow: 1,
    flexBasis: 0,
    minWidth: dimension.introToolCardMinWidth,
  },
  note: { margin: 0, color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
});

export type ImportChoice = {
  chosen: readonly ImportSource[];
};
export const NO_IMPORT: ImportChoice = { chosen: [] };

export function ImportStep({
  sessions,
  t,
  choice,
  track,
  start,
}: {
  sessions: (() => Promise<readonly ImportableSession[]>) | undefined;
  t: BotHarnessTranslate;
  choice: readonly [ImportChoice, (next: ImportChoice) => void];
  track(source: ImportSource, detected: boolean): void;
  start(product: ImportProduct | undefined, count: number): void;
}): ReactElement {
  const [{ chosen }, setChoice] = choice;
  const [rows, setRows] = useState<readonly ImportableSession[]>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const load = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    if (sessions === undefined) {
      setRows([]);
      return;
    }
    setFailed(false);
    void sessions().then(
      (next) => {
        if (live) setRows(next);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [sessions, attempt]);
  const counts = productCounts(rows ?? []);
  const local = chosen.flatMap((id) => {
    const product = LOCAL[id];
    return product === undefined ? [] : [product];
  });
  const found = local.filter((product) => counts[product] > 0);
  const missing = local.filter((product) => counts[product] === 0);
  const total = found.reduce((sum, product) => sum + counts[product], 0);
  const exportsOnly = chosen.some((id) => LOCAL[id] === undefined);
  const name = (id: ImportSource): string => t(`intro.import.source.${id}` as BotHarnessKey);
  return (
    <div ref={load} {...stylex.props(stepStyles.section)} data-intro-import="">
      <div {...stylex.props(stepStyles.section)}>
        <h2 {...stylex.props(stepStyles.title)}>{t('intro.import.title')}</h2>
        <p {...stylex.props(stepStyles.copy)}>{t('intro.import.hint')}</p>
      </div>
      <div {...stylex.props(styles.grid)} role="group" aria-label={t('intro.import.label')}>
        {IMPORT_SOURCES.map((id) => {
          const on = chosen.includes(id);
          const product = LOCAL[id];
          const count = product === undefined || rows === undefined ? undefined : counts[product];
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              data-import-source={id}
              onClick={() => {
                if (!on) track(id, count !== undefined && count > 0);
                setChoice({
                  chosen: on ? chosen.filter((other) => other !== id) : [...chosen, id],
                });
              }}
              {...stylex.props(styles.card, on && styles.chosen)}
            >
              <span {...stylex.props(styles.icon, on && styles.chosenIcon)}>
                <Icon name={on ? 'check' : ICONS[id]} />
              </span>
              <span {...stylex.props(styles.label)}>
                <span {...stylex.props(styles.strong)}>{name(id)}</span>
                {count !== undefined && count > 0 ? (
                  <span {...stylex.props(styles.meta, styles.found)}>
                    {t('intro.import.found', { count })}
                  </span>
                ) : (
                  <span {...stylex.props(styles.meta)}>
                    {t(
                      product !== undefined
                        ? 'intro.import.local'
                        : WEB.includes(id)
                          ? 'intro.import.export'
                          : 'intro.import.later',
                    )}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {found.length > 0 ? (
        <div {...stylex.props(styles.result)} role="status">
          <p {...stylex.props(styles.resultCopy)}>
            {t('intro.import.ready', {
              count: total,
              products: found.map((product) => name(product)).join(t('intro.import.join')),
            })}
          </p>
          <Button
            variant="primary"
            data-intro-import-start=""
            onClick={() => start(found.length === 1 ? found[0] : undefined, total)}
          >
            {t('intro.import.start')}
          </Button>
        </div>
      ) : null}
      {failed && local.length > 0 ? (
        <div {...stylex.props(styles.result)} role="status">
          <p {...stylex.props(styles.resultCopy)}>{t('intro.import.failed')}</p>
          <Button
            variant="outline"
            data-intro-import-retry=""
            onClick={() => setAttempt(attempt + 1)}
          >
            {t('intro.import.retry')}
          </Button>
        </div>
      ) : null}
      {!failed && rows !== undefined && missing.length > 0 ? (
        <p {...stylex.props(styles.note)} role="status">
          {t('intro.import.none', {
            products: missing.map((product) => name(product)).join(t('intro.import.join')),
          })}
        </p>
      ) : null}
      {exportsOnly ? <p {...stylex.props(styles.note)}>{t('intro.import.exportLater')}</p> : null}
    </div>
  );
}
