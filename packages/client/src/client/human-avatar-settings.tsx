import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { BotHarnessTranslate } from './locale.js';
import type { BridgeActions } from './actions.js';
import type { LocalHumanIdentity } from './bridge.js';
import { Button } from './ds/button.js';
import { Note } from './ds/note.js';
import { SettingsRow } from './ds/settings-row.js';
import { color, radius, size, space, text } from './ds/tokens.stylex.js';
import { GroupAvatarCropModal } from './group-avatar-crop.js';
import { useMountedResource } from './mounted-resource.js';

const styles = stylex.create({
  controls: { display: 'flex', alignItems: 'center', gap: space.x3 },
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
});

export interface HumanAvatarSettingsProps {
  readonly actions: Pick<BridgeActions, 'humanIdentity' | 'humanAvatarSet' | 'humanAvatars'>;
  readonly t: BotHarnessTranslate;
}

export function HumanAvatarSettings({ actions, t }: HumanAvatarSettingsProps): ReactElement {
  const [identity, setIdentity] = useState<LocalHumanIdentity>();
  const [cropFile, setCropFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const cache = actions.humanAvatars;
  useSyncExternalStore(cache.subscribe, cache.getSnapshot);
  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    const controller = new AbortController();
    actions.humanIdentity(controller.signal).then(
      (value) => {
        if (controller.signal.aborted) return;
        setIdentity(value);
        cache.want(value.humanId, value.avatarVersion);
      },
      () => {
        if (!controller.signal.aborted) setFailed(true);
      },
    );
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [actions]);

  const save = async (avatar: string | null): Promise<boolean> => {
    setBusy(true);
    setFailed(false);
    try {
      const next = await actions.humanAvatarSet(avatar);
      if (mounted.current) setIdentity(next);
      return true;
    } catch {
      if (mounted.current) setFailed(true);
      return false;
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const src =
    identity === undefined ? undefined : cache.get(identity.humanId, identity.avatarVersion);
  const initial = [...(identity?.displayName ?? '?')][0];
  return (
    <SettingsRow
      rootRef={mount}
      title={t('humanAvatar.title')}
      data={{ 'data-human-avatar-setting': identity === undefined ? 'loading' : 'ready' }}
      control={
        <span {...stylex.props(styles.controls)}>
          <span {...stylex.props(styles.avatar)} data-human-avatar-preview="">
            {src === undefined ? (
              <span aria-hidden="true">{initial}</span>
            ) : (
              <img src={src} alt="" {...stylex.props(styles.image)} />
            )}
          </span>
          {identity?.avatarVersion === undefined ? null : (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              data-human-avatar-remove=""
              onClick={() => void save(null)}
            >
              {t('humanAvatar.remove')}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={busy || identity === undefined}
            data-human-avatar-choose=""
            onClick={() => fileInput.current?.click()}
          >
            {t('humanAvatar.choose')}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            tabIndex={-1}
            aria-hidden="true"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) setCropFile(file);
              event.currentTarget.value = '';
            }}
          />
          {cropFile ? (
            <GroupAvatarCropModal
              file={cropFile}
              title={t('humanAvatar.crop')}
              t={t}
              onClose={() => setCropFile(undefined)}
              onSave={save}
            />
          ) : null}
        </span>
      }
    >
      {failed ? <Note tone="danger">{t('humanAvatar.error')}</Note> : null}
    </SettingsRow>
  );
}
