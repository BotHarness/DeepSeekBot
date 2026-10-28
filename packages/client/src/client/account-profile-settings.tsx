import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import type { BridgeActions } from './actions.js';
import type { MarketplaceAuthorAccount } from '../../../core/src/marketplace/client.js';
import type { MarketplaceAccount } from '../../../core/src/marketplace/uploaded-bots.js';
import { Note } from './ds/note.js';
import { SettingsRow, SettingsSection, SettingsValue } from './ds/settings-row.js';
import { color, radius, size, space, text } from './ds/tokens.stylex.js';
import { GroupAvatarCropModal } from './group-avatar-crop.js';
import { useMountedResource } from './mounted-resource.js';

export const ACCOUNT_NAME_MAX = 40;

const styles = stylex.create({
  avatarControls: { display: 'flex', alignItems: 'center', gap: space.x3 },
  avatar: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: size.row,
    height: size.row,
    overflow: 'hidden',
    borderRadius: radius.round,
    backgroundColor: color.hover,
    color: color.muted,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  image: { width: '100%', height: '100%', objectFit: 'cover' },
  file: { display: 'none' },
  field: { boxSizing: 'border-box', width: '200px', maxWidth: '100%', minWidth: 0 },
});

export function validAccountName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && [...trimmed].length <= ACCOUNT_NAME_MAX && !/\p{Cc}/u.test(trimmed);
}

export function defaultAccountName(email: string | undefined): string {
  return [...(email?.split('@')[0] ?? '')].slice(0, ACCOUNT_NAME_MAX).join('');
}

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; account: MarketplaceAccount };

export type AccountProfileSettingsProps = PropsLocale<'botharness'> &
  InjectFace<{
    actions: Pick<
      BridgeActions,
      'marketplaceAccount' | 'marketplaceAuthorSave' | 'marketplaceAuthorAvatarSet'
    >;
    openSignIn(): void;
  }>;

export function AccountProfileSettings({
  actions,
  openSignIn,
  t,
}: AccountProfileSettingsProps): ReactElement {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [draft, setDraft] = useState<string>();
  const [cropFile, setCropFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const pending = useRef(false);
  const mounted = useRef(false);

  const load = async (): Promise<void> => {
    try {
      const account = await actions.marketplaceAccount();
      if (mounted.current) setState({ status: 'ready', account });
    } catch {
      if (mounted.current) setState({ status: 'error' });
    }
  };

  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [actions]);

  const account = state.status === 'ready' ? state.account : undefined;
  const author = account?.author ?? null;
  const savedName = author?.name ?? '';
  const name = draft ?? savedName;

  const apply = async (
    work: () => Promise<MarketplaceAuthorAccount>,
  ): Promise<MarketplaceAuthorAccount | undefined> => {
    if (pending.current || account === undefined) return undefined;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const saved = await work();
      if (mounted.current) setState({ status: 'ready', account: { ...account, author: saved } });
      return saved;
    } catch {
      if (mounted.current) setFailed(true);
      return undefined;
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const commitName = (): void => {
    const next = name.trim();
    if (next === savedName || !validAccountName(next)) {
      if (next.length === 0) setDraft(undefined);
      return;
    }
    void apply(() => actions.marketplaceAuthorSave(next, false)).then((saved) => {
      if (saved !== undefined && mounted.current) setDraft(undefined);
    });
  };

  const saveAvatar = async (avatar: string | null): Promise<boolean> => {
    const saved = await apply(async () => {
      if (author === null) {
        const fallback = validAccountName(name) ? name.trim() : defaultAccountName(account?.email);
        await actions.marketplaceAuthorSave(fallback, false);
      }
      return actions.marketplaceAuthorAvatarSet(avatar);
    });
    return saved !== undefined;
  };

  const frame = (children: ReactNode): ReactElement => (
    <div ref={mount} data-account-profile-settings="">
      <SettingsSection>
        <Note tone="muted">{t('accountProfile.description')}</Note>
        {children}
      </SettingsSection>
    </div>
  );

  if (state.status === 'loading')
    return frame(<Note tone="muted">{t('accountProfile.loading')}</Note>);

  if (state.status === 'error')
    return frame(
      <SettingsRow
        title={t('accountProfile.loadFailed')}
        data={{ 'data-account-profile': 'error' }}
        control={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            {t('accountProfile.retry')}
          </Button>
        }
      />,
    );

  if (!state.account.signedIn)
    return frame(
      <SettingsRow
        title={t('accountProfile.signInHint')}
        data={{ 'data-account-profile': 'signed-out' }}
        control={
          <Button variant="outline" size="sm" onClick={openSignIn}>
            {t('accountProfile.signIn')}
          </Button>
        }
      />,
    );

  const invalid = name.length > 0 && !validAccountName(name);
  return frame(
    <>
      <SettingsRow
        title={t('accountProfile.photo')}
        data={{ 'data-account-profile': 'ready' }}
        control={
          <span {...stylex.props(styles.avatarControls)}>
            <span {...stylex.props(styles.avatar)} data-account-avatar="">
              {author?.avatar ? (
                <img src={author.avatar} alt="" {...stylex.props(styles.image)} />
              ) : (
                <span aria-hidden="true">{[...(savedName || state.account.email || '?')][0]}</span>
              )}
            </span>
            {author?.avatar ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                data-account-avatar-remove=""
                onClick={() => void saveAvatar(null)}
              >
                {t('accountProfile.photoRemove')}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              data-account-avatar-choose=""
              onClick={() => fileInput.current?.click()}
            >
              {t('accountProfile.photoChoose')}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              tabIndex={-1}
              aria-hidden="true"
              {...stylex.props(styles.file)}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) setCropFile(file);
                event.currentTarget.value = '';
              }}
            />
          </span>
        }
      />
      <SettingsRow
        title={<label htmlFor="bh-account-name">{t('accountProfile.name')}</label>}
        control={
          <Input
            id="bh-account-name"
            aria-label={t('accountProfile.name')}
            className={stylex.props(styles.field).className ?? ''}
            value={name}
            placeholder={defaultAccountName(state.account.email)}
            maxLength={ACCOUNT_NAME_MAX}
            disabled={busy}
            aria-invalid={invalid}
            data-account-name=""
            onChange={(event) => setDraft(event.currentTarget.value)}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setDraft(undefined);
                return;
              }
              if (event.key !== 'Enter' || composing.current) return;
              event.preventDefault();
              commitName();
            }}
            onBlur={commitName}
          />
        }
      >
        {invalid ? <Note tone="danger">{t('accountProfile.nameInvalid')}</Note> : null}
        {failed ? (
          <span data-account-profile-error="">
            <Note tone="danger">{t('accountProfile.saveFailed')}</Note>
          </span>
        ) : null}
      </SettingsRow>
      {author === null ? null : (
        <SettingsRow
          title={t('accountProfile.id')}
          control={
            <SettingsValue>
              <span data-account-id="">{`#${author.id}`}</span>
            </SettingsValue>
          }
        />
      )}
      {state.account.email === undefined ? null : (
        <SettingsRow
          title={t('accountProfile.email')}
          control={
            <SettingsValue>
              <span data-account-email="">{state.account.email}</span>
            </SettingsValue>
          }
        />
      )}
      {cropFile ? (
        <GroupAvatarCropModal
          file={cropFile}
          title={t('accountProfile.photoCrop')}
          t={t}
          onClose={() => setCropFile(undefined)}
          onSave={saveAvatar}
        />
      ) : null}
    </>,
  );
}
