import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import type { BridgeCall } from './bridge.js';
import { Button } from './ds/button.js';
import { Note } from './ds/note.js';
import { radius, space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import {
  invitationText,
  loadMemberInvitation,
  type MemberInvitation,
} from './team-invitation-text.js';
import { teamErrorText } from './team-settings.js';

const styles = stylex.create({
  root: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  qr: {
    width: '200px',
    height: '200px',
    padding: space.x3,
    borderRadius: radius.md,
    backgroundColor: 'white',
  },
  actions: { display: 'flex', flexWrap: 'wrap', gap: space.x2 },
});

export function MemberInvitationPanel({
  call,
  t,
  humanId,
  username,
  password,
  urls,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  humanId: string;
  username: string;
  password?: string | undefined;
  urls: readonly string[];
}): ReactElement {
  const [invitation, setInvitation] = useState<MemberInvitation>();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState<'link' | 'text'>();
  const [revision, setRevision] = useState(0);
  const mount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    setError(undefined);
    loadMemberInvitation(call, humanId)
      .then((value) => {
        if (live) setInvitation(value);
      })
      .catch((failure: unknown) => {
        if (live) setError(teamErrorText(t, failure));
      });
    return () => {
      live = false;
    };
  }, [call, humanId, revision]);
  const copy = (kind: 'link' | 'text'): void => {
    if (invitation === undefined) return;
    const value =
      kind === 'link'
        ? invitation.link
        : invitationText(t, { link: invitation.link, username, address: urls[0], password });
    void navigator.clipboard
      .writeText(value)
      .then(() => setCopied(kind))
      .catch(() => setCopied(undefined));
  };
  return (
    <div ref={mount} {...stylex.props(styles.root)} data-team-invitation={username}>
      {urls.length === 0 ? <Note tone="warning">{t('team.invite.noAddress')}</Note> : null}
      {error !== undefined ? <Note tone="danger">{error}</Note> : null}
      {invitation === undefined || urls.length === 0 ? null : (
        <>
          <svg
            viewBox={`0 0 ${String(invitation.qr.size)} ${String(invitation.qr.size)}`}
            shapeRendering="crispEdges"
            role="img"
            aria-label={t('team.invite.qrLabel')}
            data-team-invitation-qr=""
            {...stylex.props(styles.qr)}
          >
            <path d={invitation.qr.path} fill="black" />
          </svg>
          <Note>{t('team.invite.qrHint')}</Note>
          <div {...stylex.props(styles.actions)}>
            <Button variant="outline" type="button" onClick={() => copy('text')}>
              {t(copied === 'text' ? 'team.members.copied' : 'team.invite.copyText')}
            </Button>
            <Button variant="outline" type="button" onClick={() => copy('link')}>
              {t(copied === 'link' ? 'team.members.copied' : 'team.invite.copyLink')}
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setCopied(undefined);
                setRevision((value) => value + 1);
              }}
            >
              {t('team.invite.renew')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
