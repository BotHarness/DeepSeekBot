import { createContext, useContext, useState, type ReactElement } from 'react';

import * as stylex from '@stylexjs/stylex';

import { ASSIGNMENT_SESSION_ICON, ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { ChipButton } from './ds/chip-button.js';
import { color, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { personaBotSessionRows } from './session-rows.js';
import { useSessionViewPreference } from './session-view-prefs.js';
import { useClientStore } from './use-client-store.js';
import type { ChannelMessage } from './store.js';

export type SessionLink = NonNullable<ChannelMessage['sessionLinks']>[number];

export type OpenSession = (botSlug: string | undefined, sessionId: string, title: string) => void;

export const SessionOpenContext = createContext<OpenSession | undefined>(undefined);

export const useOpenSession = (): OpenSession | undefined => useContext(SessionOpenContext);

const MENTION_HOST = 'https://session.tobs.invalid/';
const MENTION = /\]\(session:([A-Za-z0-9_.:-]{1,200})\)/gu;

export function hasSessionMentions(body: string): boolean {
  return /\]\(session:[A-Za-z0-9_.:-]/u.test(body);
}

export function withSessionMentionLinks(body: string): string {
  return body.replace(MENTION, (_match, id: string) => `](${MENTION_HOST}${id})`);
}

export function sessionMentionId(href: string): string | undefined {
  if (!href.startsWith(MENTION_HOST)) return undefined;
  const id = decodeURIComponent(href.slice(MENTION_HOST.length));
  return /^[A-Za-z0-9_.:-]{1,200}$/u.test(id) ? id : undefined;
}

const styles = stylex.create({
  rail: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    columnGap: space.x2,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.bodyLine,
  },
  above: { marginBottom: space.x2 },
  below: { marginTop: space.x2 },
  elbow: { width: '14px', height: '100%', minHeight: '20px', color: color.subtle },
  rows: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: space.x1 },
  head: { display: 'flex', alignItems: 'center', gap: space.x2 },
  row: { display: 'flex', alignItems: 'center', gap: space.x2, minWidth: 0, maxWidth: '100%' },
  needs: { color: color.warning, flexShrink: 0 },
});

function Elbow({ kind }: { kind: SessionLink['kind'] }): ReactElement {
  return (
    <svg
      viewBox="0 0 14 20"
      preserveAspectRatio="none"
      aria-hidden="true"
      {...stylex.props(styles.elbow)}
    >
      <path
        d={kind === 'created' ? 'M2 0 V10 Q2 14 6 14 H14' : 'M2 20 V10 Q2 6 6 6 H14'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function SessionLinkRail({
  botSlug,
  kind,
  links,
  t,
}: {
  botSlug: string;
  kind: SessionLink['kind'];
  links: readonly SessionLink[];
  t: BotHarnessTranslate;
}): ReactElement | null {
  const open = useOpenSession();
  const preference = useSessionViewPreference(botSlug);
  const items = useClientStore((state) => state.sessions.items);
  const [expanded, setExpanded] = useState(false);
  const own = links.filter((link) => link.kind === kind);
  if (!preference.links || own.length === 0) return null;
  const rows = personaBotSessionRows(items, {}, 'all');
  const folded = own.length > 1 && !expanded;
  const label = t(kind === 'created' ? 'sessions.link.created' : 'sessions.link.sent');
  return (
    <div
      data-session-links={kind}
      {...stylex.props(styles.rail, kind === 'created' ? styles.below : styles.above)}
    >
      <Elbow kind={kind} />
      <div {...stylex.props(styles.rows)}>
        {own.length > 1 ? (
          <ChipButton
            data-session-links-toggle=""
            aria-expanded={!folded}
            onClick={() => setExpanded(!expanded)}
            icon={<ChannelSidebarIcon name="chevron-right" size={12} />}
            label={t('sessions.link.count', { label, count: own.length })}
          />
        ) : null}
        {folded
          ? null
          : own.map((link) => {
              const row = rows.find((entry) => entry.sessionId === link.sessionId);
              return (
                <span key={link.sessionId} {...stylex.props(styles.row)}>
                  <ChipButton
                    data-session-link={link.sessionId}
                    icon={<ChannelSidebarIcon name={ASSIGNMENT_SESSION_ICON} size={14} />}
                    disabled={open === undefined}
                    onClick={() => open?.(botSlug, link.sessionId, row?.title ?? link.title)}
                    title={own.length === 1 ? label : undefined}
                    label={row?.title ?? link.title}
                  />
                  {row?.needs === undefined ? null : (
                    <span {...stylex.props(styles.needs)}>{t(`sessions.needs.${row.needs}`)}</span>
                  )}
                </span>
              );
            })}
      </div>
    </div>
  );
}
