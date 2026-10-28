import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import type {
  MarketplaceDigest,
  MarketplaceDigestSummary,
  MarketplaceEntry,
} from '../../../core/src/marketplace/client.js';
import type { MarketplaceLanguage } from '../../../core/src/marketplace/language.js';
import type { BridgeActions } from './actions.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { marketplaceError } from './marketplace.js';
import { useMountedResource } from './mounted-resource.js';

const styles = stylex.create({
  hero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: space.x2,
    width: '100%',
    padding: space.x5,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.lg,
    backgroundColor: { default: color.accentTint, ':hover': color.selected },
    color: color.fg,
    textAlign: 'start',
    cursor: 'pointer',
    flexShrink: 0,
  },
  eyebrow: {
    color: color.accentText,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  heroTitle: {
    margin: 0,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  lede: { margin: 0, color: color.muted, fontSize: text.bodySize, lineHeight: text.bodyLine },
  article: { display: 'flex', flexDirection: 'column', gap: space.x5, minWidth: 0 },
  date: { color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
  articleLede: {
    margin: 0,
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  section: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  heading: {
    margin: 0,
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  body: { margin: 0, color: color.fg, fontSize: text.bodySize, lineHeight: text.bodyLine },
  card: { maxWidth: '360px' },
  archive: { display: 'flex', flexDirection: 'column', gap: space.x2, minWidth: 0 },
  archiveItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    width: '100%',
    padding: space.x4,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.md,
    backgroundColor: { default: color.surface, ':hover': color.hover },
    color: color.fg,
    textAlign: 'start',
    cursor: 'pointer',
  },
  archiveTitle: { fontSize: text.titleSize, lineHeight: text.titleLine, fontWeight: text.strong },
});

export function digestDate(day: string, lang: MarketplaceLanguage): string {
  const at = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(at)) return day;
  return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: 'UTC',
  }).format(at);
}

type ArchiveState =
  | { status: 'loading' }
  | { status: 'error'; cause: unknown }
  | { status: 'ready'; digests: MarketplaceDigestSummary[] };

export function MarketDigestDialog({
  actions,
  lang,
  t,
  initial,
  renderBot,
  onClose,
}: {
  actions: BridgeActions;
  lang: MarketplaceLanguage;
  t: BotHarnessTranslate;
  initial: MarketplaceDigest;
  renderBot: (bot: MarketplaceEntry) => ReactElement;
  onClose: () => void;
}): ReactElement {
  const [digest, setDigest] = useState(initial);
  const [archive, setArchive] = useState<ArchiveState | undefined>(undefined);
  const [cause, setCause] = useState<unknown>();
  const ticket = useRef(0);

  const showArchive = (): void => {
    actions.telemetryEvent('marketplace:digest_archive_open');
    const current = ++ticket.current;
    setCause(undefined);
    setArchive({ status: 'loading' });
    void actions.marketplaceDigests(lang).then(
      (digests) => {
        if (current === ticket.current) setArchive({ status: 'ready', digests });
      },
      (failure: unknown) => {
        if (current === ticket.current) setArchive({ status: 'error', cause: failure });
      },
    );
  };

  const open = (day: string): void => {
    const current = ++ticket.current;
    setCause(undefined);
    void actions.marketplaceDigest(day, lang).then(
      (loaded) => {
        if (current !== ticket.current) return;
        actions.telemetryEvent('marketplace:digest_open', { entry: 'archive' });
        setDigest(loaded);
        setArchive(undefined);
      },
      (failure: unknown) => {
        if (current === ticket.current) setCause(failure);
      },
    );
  };

  return (
    <PanelDialog
      title={archive === undefined ? digest.title : t('market.digest.archive')}
      closeLabel={t('common.close')}
      onClose={onClose}
      scroll
      data={{ 'data-market-digest': archive === undefined ? digest.day : 'archive' }}
      secondary={
        archive === undefined ? (
          <Button variant="outline" onClick={showArchive}>
            {t('market.digest.archive')}
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setArchive(undefined)}>
            {t('market.digest.back')}
          </Button>
        )
      }
    >
      {cause === undefined ? null : <Note tone="danger">{marketplaceError(cause, t)}</Note>}
      {archive === undefined ? (
        <article {...stylex.props(styles.article)}>
          <span {...stylex.props(styles.date)}>{digestDate(digest.day, lang)}</span>
          <p {...stylex.props(styles.articleLede)}>{digest.lede}</p>
          {digest.sections.map((section) => (
            <section key={section.heading} {...stylex.props(styles.section)}>
              <h3 {...stylex.props(styles.heading)}>{section.heading}</h3>
              <p {...stylex.props(styles.body)}>{section.body}</p>
              {section.bot === null ? null : (
                <div {...stylex.props(styles.card)} role="list">
                  {renderBot(section.bot)}
                </div>
              )}
            </section>
          ))}
        </article>
      ) : archive.status === 'loading' ? (
        <Note>{t('market.digest.loading')}</Note>
      ) : archive.status === 'error' ? (
        <Note tone="danger">{marketplaceError(archive.cause, t)}</Note>
      ) : (
        <div {...stylex.props(styles.archive)} role="list">
          {archive.digests.map((item) => (
            <div key={item.day} role="listitem">
              <button
                type="button"
                data-market-digest-day={item.day}
                {...stylex.props(styles.archiveItem)}
                onClick={() => open(item.day)}
              >
                <span {...stylex.props(styles.date)}>{digestDate(item.day, lang)}</span>
                <span {...stylex.props(styles.archiveTitle)}>{item.title}</span>
                <span {...stylex.props(styles.lede)}>{item.lede}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </PanelDialog>
  );
}

export function MarketDigestHero({
  actions,
  lang,
  t,
  renderBot,
}: {
  actions: BridgeActions;
  lang: MarketplaceLanguage;
  t: BotHarnessTranslate;
  renderBot: (bot: MarketplaceEntry, close: () => void) => ReactElement;
}): ReactElement {
  const [digest, setDigest] = useState<MarketplaceDigest | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const mount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    setDigest(undefined);
    void actions.marketplaceDigest(undefined, lang).then(
      (loaded) => {
        if (!live) return;
        setDigest(loaded);
        actions.telemetryEvent('marketplace:digest_view');
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [lang]);
  return (
    <div ref={mount} hidden={digest === undefined} data-market-digest-hero="">
      {digest === undefined ? null : (
        <button
          type="button"
          {...stylex.props(styles.hero)}
          aria-label={t('market.digest.read', { title: digest.title })}
          onClick={() => {
            actions.telemetryEvent('marketplace:digest_open', { entry: 'hero' });
            setOpen(true);
          }}
        >
          <span {...stylex.props(styles.eyebrow)}>
            {t('market.digest.label')} · {digestDate(digest.day, lang)}
          </span>
          <span {...stylex.props(styles.heroTitle)}>{digest.title}</span>
          <span {...stylex.props(styles.lede)}>{digest.lede}</span>
        </button>
      )}
      {open && digest !== undefined ? (
        <MarketDigestDialog
          actions={actions}
          lang={lang}
          t={t}
          initial={digest}
          renderBot={(bot) => renderBot(bot, () => setOpen(false))}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
