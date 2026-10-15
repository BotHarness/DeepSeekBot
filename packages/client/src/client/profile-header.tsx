import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { BANNER_SCENES, seededBannerRecipe } from '@botharness/pixel-banner';
import {
  Button,
  IconEllipsisOutlineRegular,
  IconTrashOutlineRegular,
  Menu,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import { PersonaBotAvatar } from './avatar.js';
import { AvatarAppearanceEditor } from './avatar-appearance-editor.js';
import { bannerOf, BotBannerArt } from './bot-banner.js';
import { BotZipShareButton } from './bot-zip.js';
import { Field, TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { BannerCropModal, PersonaBotAvatarCropModal } from './personabot-avatar-crop.js';
import { botPrimaryColorOf } from './bot-primary-color.js';
import { PrimaryColorModal } from './primary-color-editor.js';
import { ProfileTags } from './profile-tags.js';
import type { BotBannerView, BotSummary, ChannelSummary } from './store.js';
import {
  MAX_BOT_BIO_LENGTH,
  MAX_BOT_TAG_LENGTH,
  MAX_BOT_TAGS,
  TagEditor,
  tagsWithDraft,
} from './tag-editor.js';

const styles = stylex.create({
  textarea: {
    boxSizing: 'border-box',
    width: '100%',
    resize: 'vertical',
    padding: space.x3,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.sm,
    backgroundColor: 'var(--dsw-alias-bg-base)',
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '1px',
  },
  hint: {
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  file: { display: 'none' },
  colorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x4,
    marginBottom: space.x4,
    paddingBlock: space.x3,
    paddingInline: space.x4,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.md,
  },
  colorSwatch: {
    flexShrink: 0,
    width: '24px',
    height: '24px',
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.round,
  },
  colorCopy: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0,
  },
  colorTitle: {
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  bannerPreview: {
    aspectRatio: '3 / 1',
    overflow: 'hidden',
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.md,
  },
  bannerActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.x3,
  },
  scenes: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))',
    gap: space.x3,
  },
  scene: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    padding: space.x2,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.muted,
    fontFamily: 'inherit',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    textAlign: 'center',
    cursor: { default: 'pointer', ':disabled': 'default' },
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.fg}` },
  },
  sceneOn: {
    borderColor: color.fg,
    boxShadow: `0 0 0 1px ${color.fg}`,
    color: color.fg,
  },
  sceneArt: {
    display: 'block',
    aspectRatio: '3 / 1',
    overflow: 'hidden',
    borderRadius: radius.sm,
  },
});

export function ProfileBio({ text }: { text: string | undefined }): ReactElement | null {
  if (text === undefined || text.length === 0) return null;
  return <p className="bh-profile-description">{text}</p>;
}

function EditProfileModal({
  bot,
  channel,
  actions,
  t,
  onClose,
}: {
  bot: BotSummary;
  channel: ChannelSummary;
  actions: Pick<BridgeActions, 'renameChannel' | 'updateBotProfile'>;
  t: BotHarnessTranslate;
  onClose(): void;
}): ReactElement {
  const [name, setName] = useState(bot.displayName);
  const [tags, setTags] = useState<string[]>([...bot.roles]);
  const [tagDraft, setTagDraft] = useState('');
  const [bio, setBio] = useState(bot.description ?? '');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const nextTags = tagsWithDraft(tags, tagDraft);
  const bioLength = [...bio.trim()].length;
  const tagsInvalid =
    nextTags.length > MAX_BOT_TAGS || nextTags.some((tag) => [...tag].length > MAX_BOT_TAG_LENGTH);
  const bioInvalid = bioLength > MAX_BOT_BIO_LENGTH;
  const invalid = name.trim().length === 0 || bioInvalid || tagsInvalid;
  const tagsLimit = t('profile.tags.limit', { max: MAX_BOT_TAGS, length: MAX_BOT_TAG_LENGTH });
  const bioCount = t('profile.bio.count', { count: bioLength, max: MAX_BOT_BIO_LENGTH });

  const save = async (): Promise<void> => {
    if (invalid || busy) return;
    setBusy(true);
    setFailed(false);
    const trimmedName = name.trim();
    const trimmedBio = bio.trim();
    const renamed =
      trimmedName === bot.displayName.trim()
        ? true
        : await actions.renameChannel(channel.id, trimmedName);
    const profileChanged =
      JSON.stringify(nextTags) !== JSON.stringify(bot.roles) ||
      trimmedBio !== (bot.description ?? '');
    const updated =
      renamed && profileChanged
        ? await actions.updateBotProfile(bot.slug, {
            roles: nextTags,
            description: trimmedBio,
          })
        : renamed;
    setBusy(false);
    if (updated) onClose();
    else setFailed(true);
  };

  return (
    <FormDialog
      title={t('profile.edit.title')}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('profile.save')}
      submitDisabled={invalid}
      busy={busy}
      error={failed ? t('profile.updateFailed') : undefined}
      onCancel={onClose}
      onSubmit={() => void save()}
    >
      <TextField
        label={t('profile.name')}
        value={name}
        disabled={busy}
        onChange={setName}
        initialFocus
      />
      <Field
        label={t('profile.tags')}
        {...(tagsInvalid ? { error: tagsLimit } : { hint: tagsLimit })}
      >
        {(control) => (
          <TagEditor
            id={control.id}
            tags={tags}
            draft={tagDraft}
            disabled={busy}
            t={t}
            onTags={setTags}
            onDraft={setTagDraft}
          />
        )}
      </Field>
      <Field label={t('profile.bio')} {...(bioInvalid ? { error: bioCount } : { hint: bioCount })}>
        {(control) => (
          <textarea
            {...control}
            rows={3}
            value={bio}
            disabled={busy}
            placeholder={t('profile.bio.placeholder')}
            onChange={(event) => setBio(event.currentTarget.value)}
            {...stylex.props(styles.textarea)}
          />
        )}
      </Field>
    </FormDialog>
  );
}

function AvatarModal({
  bot,
  channel,
  actions,
  t,
  onClose,
}: {
  bot: BotSummary;
  channel: ChannelSummary;
  actions: Pick<
    BridgeActions,
    | 'setBotAppearance'
    | 'setBotAvatar'
    | 'setBotPrimaryColor'
    | 'loadPartLibrary'
    | 'addLibraryPart'
    | 'exportLibraryParts'
    | 'importLibraryParts'
    | 'importLibraryImage'
  >;
  t: BotHarnessTranslate;
  onClose(): void;
}): ReactElement {
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [coloring, setColoring] = useState(false);
  const primary = botPrimaryColorOf(bot);
  const input = useRef<HTMLInputElement | null>(null);
  const removeImage = async (): Promise<void> => {
    setBusy(true);
    const updated = await actions.setBotAvatar(channel.id, null);
    setBusy(false);
    setFailed(!updated);
  };
  return (
    <PanelDialog
      size="medium"
      onClose={onClose}
      title={t('profile.avatar.section')}
      closeLabel={t('common.close')}
    >
      <div data-primary-color-source={primary.source} {...stylex.props(styles.colorRow)}>
        <span
          aria-hidden="true"
          {...stylex.props(styles.colorSwatch)}
          style={{ background: primary.color }}
        />
        <span {...stylex.props(styles.colorCopy)}>
          <span {...stylex.props(styles.colorTitle)}>{t('profile.primaryColor.title')}</span>
          <span {...stylex.props(styles.hint)}>
            {t(`profile.primaryColor.summary.${primary.source}`)}
          </span>
        </span>
        <Button size="sm" variant="outline" onClick={() => setColoring(true)}>
          {t('profile.primaryColor.edit')}
        </Button>
      </div>
      <AvatarAppearanceEditor
        key={`avatar-${bot.slug}`}
        bot={bot}
        channelId={channel.id}
        onSave={actions.setBotAppearance}
        library={{
          load: actions.loadPartLibrary,
          add: actions.addLibraryPart,
          exportParts: actions.exportLibraryParts,
          importParts: actions.importLibraryParts,
          importImage: actions.importLibraryImage,
        }}
        onUpload={() => input.current?.click()}
        onRemoveImage={() => void removeImage()}
        imageBusy={busy}
        t={t}
      />
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const chosen = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (chosen !== undefined) setFile(chosen);
        }}
        {...stylex.props(styles.file)}
      />
      {failed ? <Note tone="danger">{t('profile.avatar.failed')}</Note> : null}
      {coloring ? (
        <PrimaryColorModal
          bot={bot}
          channel={channel}
          actions={actions}
          t={t}
          onClose={() => setColoring(false)}
        />
      ) : null}
      {file === undefined ? null : (
        <PersonaBotAvatarCropModal
          file={file}
          t={t}
          onClose={() => setFile(undefined)}
          onSave={async (avatar) => {
            const updated = await actions.setBotAvatar(channel.id, avatar);
            setFailed(!updated);
            return updated;
          }}
        />
      )}
    </PanelDialog>
  );
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

function BannerModal({
  bot,
  channel,
  actions,
  t,
  onClose,
}: {
  bot: BotSummary;
  channel: ChannelSummary;
  actions: Pick<BridgeActions, 'setBotBanner'>;
  t: BotHarnessTranslate;
  onClose(): void;
}): ReactElement {
  const initial = bannerOf(bot.banner, bot.displayName);
  const [draft, setDraft] = useState<BotBannerView>(initial);
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const seed = 'recipe' in draft ? draft.recipe.seed : seededBannerRecipe(bot.displayName).seed;
  const scene = 'recipe' in draft ? draft.recipe.scene : undefined;
  const save = async (): Promise<void> => {
    if (JSON.stringify(draft) === JSON.stringify(initial)) {
      onClose();
      return;
    }
    setBusy(true);
    setFailed(false);
    const saved = await actions.setBotBanner(channel.id, draft);
    setBusy(false);
    if (saved) onClose();
    else setFailed(true);
  };
  return (
    <FormDialog
      title={t('profile.banner.title')}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('profile.save')}
      busy={busy}
      error={failed ? t('profile.banner.failed') : undefined}
      onCancel={onClose}
      onSubmit={() => void save()}
    >
      <div {...stylex.props(styles.bannerPreview)}>
        <BotBannerArt banner={draft} />
      </div>
      <div {...stylex.props(styles.bannerActions)}>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || scene === undefined}
          onClick={() => scene !== undefined && setDraft({ recipe: { scene, seed: randomSeed() } })}
        >
          {t('profile.banner.reroll')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {t('profile.banner.upload')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setDraft({ recipe: seededBannerRecipe(bot.displayName) })}
        >
          {t('profile.banner.reset')}
        </Button>
      </div>
      {scene === undefined ? <Note>{t('profile.banner.uploaded')}</Note> : null}
      <Field label={t('profile.banner.scene')} group>
        {() => (
          <div
            role="radiogroup"
            aria-label={t('profile.banner.scene')}
            {...stylex.props(styles.scenes)}
          >
            {BANNER_SCENES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={scene === option}
                data-banner-scene={option}
                disabled={busy}
                onClick={() => setDraft({ recipe: { scene: option, seed } })}
                {...stylex.props(styles.scene, scene === option && styles.sceneOn)}
              >
                <span {...stylex.props(styles.sceneArt)}>
                  <BotBannerArt banner={{ recipe: { scene: option, seed } }} />
                </span>
                <span>{t(`profile.banner.scene.${option}`)}</span>
              </button>
            ))}
          </div>
        )}
      </Field>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const chosen = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (chosen !== undefined) setFile(chosen);
        }}
        {...stylex.props(styles.file)}
      />
      {file === undefined ? null : (
        <BannerCropModal
          file={file}
          t={t}
          onClose={() => setFile(undefined)}
          onSave={async (image) => {
            setDraft({ image });
            return true;
          }}
        />
      )}
    </FormDialog>
  );
}

export function ProfileHeader({
  bot,
  channel,
  actions,
  t,
  onDelete,
}: {
  bot: BotSummary;
  channel: ChannelSummary;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onDelete(): void;
}): ReactElement {
  const [panel, setPanel] = useState<'edit' | 'avatar' | 'banner'>();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuItems: readonly MenuEntry[] = [
    {
      id: 'delete',
      label: t('deletion.title'),
      icon: <IconTrashOutlineRegular size={16} />,
      danger: true,
    },
  ];
  return (
    <header className="bh-profile-header">
      <div className="bh-profile-banner">
        <BotBannerArt banner={bannerOf(bot.banner, bot.displayName)} />
        {bot.deleted ? null : (
          <button
            type="button"
            className="bh-profile-banner-edit"
            onClick={() => setPanel('banner')}
          >
            {t('profile.banner.edit')}
          </button>
        )}
      </div>
      <div className="bh-profile-header-body">
        <div className="bh-profile-header-top">
          <button
            type="button"
            className="bh-profile-avatar-button"
            aria-label={t('profile.avatar.change')}
            disabled={bot.deleted}
            onClick={() => setPanel('avatar')}
          >
            <PersonaBotAvatar
              t={t}
              personaBotId={bot.slug}
              name={bot.displayName}
              src={bot.avatar}
              appearance={bot.appearance}
              avatarSeed={bot.avatarSeed}
              size={80}
              indicator={false}
            />
          </button>
          {bot.deleted ? null : (
            <div className="bh-profile-header-actions">
              <BotZipShareButton bot={bot} actions={actions} t={t} />
              <Button size="sm" variant="outline" onClick={() => setPanel('edit')}>
                {t('profile.edit')}
              </Button>
              <Menu
                open={menuOpen}
                portal
                dense
                align="end"
                anchor={
                  <button
                    type="button"
                    className="bh-icon-btn bh-profile-more"
                    aria-label={t('profile.more')}
                    onClick={() => setMenuOpen((value) => !value)}
                  >
                    <IconEllipsisOutlineRegular size={16} />
                  </button>
                }
                items={menuItems}
                onSelect={(id) => {
                  setMenuOpen(false);
                  if (id === 'delete') onDelete();
                }}
                onClose={() => setMenuOpen(false)}
              />
            </div>
          )}
        </div>
        <h2 className="bh-profile-view-name">{bot.displayName}</h2>
        <ProfileTags tags={bot.roles} />
        <ProfileBio text={bot.description} />
      </div>
      {panel === 'edit' ? (
        <EditProfileModal
          bot={bot}
          channel={channel}
          actions={actions}
          t={t}
          onClose={() => setPanel(undefined)}
        />
      ) : null}
      {panel === 'banner' ? (
        <BannerModal
          bot={bot}
          channel={channel}
          actions={actions}
          t={t}
          onClose={() => setPanel(undefined)}
        />
      ) : null}
      {panel === 'avatar' ? (
        <AvatarModal
          bot={bot}
          channel={channel}
          actions={actions}
          t={t}
          onClose={() => setPanel(undefined)}
        />
      ) : null}
    </header>
  );
}
