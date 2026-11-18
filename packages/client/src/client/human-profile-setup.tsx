import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import type { BridgeActions } from './actions.js';
import {
  finishHumanProfileSetup,
  setHumanDefaultName,
  type BridgeCall,
  type LocalHumanIdentity,
} from './bridge.js';
import { Button } from './ds/button.js';
import { TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import { GroupAvatarCropModal } from './group-avatar-crop.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

const NAME_MAX = 128;

const styles = stylex.create({
  photo: { display: 'flex', alignItems: 'center', gap: space.x4 },
  avatar: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: '64px',
    height: '64px',
    overflow: 'hidden',
    borderRadius: radius.round,
    backgroundColor: color.hover,
    color: color.muted,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
  },
  image: { width: '100%', height: '100%', objectFit: 'cover' },
});

export interface HumanProfileSetupProps {
  readonly call: BridgeCall;
  readonly actions: Pick<BridgeActions, 'humanIdentity' | 'humanAvatarSet' | 'humanAvatars'>;
  readonly t: BotHarnessTranslate;
}

export function HumanProfileSetup({ call, actions, t }: HumanProfileSetupProps): ReactElement {
  const [identity, setIdentity] = useState<LocalHumanIdentity>();
  const [draft, setDraft] = useState('');
  const [cropFile, setCropFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cache = actions.humanAvatars;
  useSyncExternalStore(cache.subscribe, cache.getSnapshot, cache.getSnapshot);
  const mount = useMountedResource<HTMLSpanElement>(() => {
    const controller = new AbortController();
    actions.humanIdentity(controller.signal).then(
      (value) => {
        if (controller.signal.aborted || value.profileSetup !== 'pending') return;
        setIdentity(value);
        setDraft(value.displayName);
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [actions]);

  if (identity === undefined || done) return <span ref={mount} hidden />;
  const name = draft.trim();
  const valid = name.length > 0 && name.length <= NAME_MAX && !/\p{Cc}/u.test(name);
  if (identity.avatarVersion !== undefined) cache.want(identity.humanId, identity.avatarVersion);
  const src =
    identity.avatarVersion === undefined
      ? undefined
      : cache.get(identity.humanId, identity.avatarVersion);

  const finish = async (save: boolean): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      if (save && name !== identity.displayName) await setHumanDefaultName(call, name);
      await finishHumanProfileSetup(call);
      setDone(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const savePhoto = async (avatar: string): Promise<boolean> => {
    try {
      setIdentity(await actions.humanAvatarSet(avatar));
      setFailed(false);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <span ref={mount}>
      <FormDialog
        title={t('profileSetup.title')}
        description={t('profileSetup.description')}
        labels={{ close: t('profileSetup.later'), cancel: t('profileSetup.later') }}
        submitLabel={t('profileSetup.done')}
        submitDisabled={!valid}
        submitData={{ 'data-profile-setup-done': '' }}
        busy={busy}
        error={failed ? t('profileSetup.error') : undefined}
        onCancel={() => void finish(false)}
        onClose={() => void finish(false)}
        onSubmit={() => void finish(true)}
      >
        <div {...stylex.props(styles.photo)} data-profile-setup="">
          <span {...stylex.props(styles.avatar)} data-profile-setup-preview="">
            {src === undefined ? (
              <span aria-hidden="true">{[...(name || identity.displayName)][0]}</span>
            ) : (
              <img src={src} alt="" {...stylex.props(styles.image)} />
            )}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            data-profile-setup-photo=""
            onClick={() => fileInput.current?.click()}
          >
            {t(src === undefined ? 'profileSetup.choosePhoto' : 'humanAvatar.choose')}
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
        </div>
        <TextField
          label={t('profileSetup.name')}
          hint={t('profileSetup.nameHint')}
          data-profile-setup-name=""
          value={draft}
          maxLength={NAME_MAX}
          disabled={busy}
          onChange={setDraft}
          initialFocus
        />
      </FormDialog>
      {cropFile ? (
        <GroupAvatarCropModal
          file={cropFile}
          title={t('humanAvatar.crop')}
          t={t}
          onClose={() => setCropFile(undefined)}
          onSave={savePhoto}
        />
      ) : null}
    </span>
  );
}
