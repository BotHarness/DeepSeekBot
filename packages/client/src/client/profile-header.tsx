import { useId, useRef, useState, type ReactElement } from 'react';
import { BANNER_SCENES, seededBannerRecipe } from '@botharness/pixel-banner';
import {
  Button,
  IconEllipsisOutlineRegular,
  Menu,
  Tag,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import { PersonaBotAvatar } from './avatar.js';
import { AvatarAppearanceEditor } from './avatar-appearance-editor.js';
import { bannerOf, BotBannerArt } from './bot-banner.js';
import { BotZipShareButton } from './bot-zip.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { NameInput } from './name-input.js';
import { BannerCropModal, PersonaBotAvatarCropModal } from './personabot-avatar-crop.js';
import { botPrimaryColorOf } from './bot-primary-color.js';
import { PrimaryColorModal } from './primary-color-editor.js';
import type { BotBannerView, BotSummary, ChannelSummary } from './store.js';
import {
  MAX_BOT_BIO_LENGTH,
  MAX_BOT_TAG_LENGTH,
  MAX_BOT_TAGS,
  TagEditor,
  tagsWithDraft,
} from './tag-editor.js';

export function ProfileTags({ tags }: { tags: readonly string[] }): ReactElement | null {
  if (tags.length === 0) return null;
  return (
    <span className="bh-profile-roles">
      {tags.map((tag) => (
        <Tag key={tag} tone="neutral">
          {tag}
        </Tag>
      ))}
    </span>
  );
}

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
  const nameId = useId();
  const tagsId = useId();
  const bioId = useId();
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
  const invalid = name.trim().length === 0 || bioLength > MAX_BOT_BIO_LENGTH || tagsInvalid;

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
    <Modal
      open
      onClose={onClose}
      title={t('profile.edit.title')}
      closeLabel={t('common.close')}
      className="bh-sidebar-modal bh-profile-edit-modal"
      footer={
        <div className="bh-modal-footer">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={busy || invalid} onClick={() => void save()}>
            {t('profile.save')}
          </Button>
        </div>
      }
    >
      <form
        className="bh-sidebar-modal-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="bh-personabot-field">
          <label className="bh-personabot-label" htmlFor={nameId}>
            {t('profile.name')}
          </label>
          <NameInput
            id={nameId}
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </div>
        <div className="bh-personabot-field">
          <label className="bh-personabot-label" htmlFor={tagsId}>
            {t('profile.tags')}
          </label>
          <TagEditor
            id={tagsId}
            tags={tags}
            draft={tagDraft}
            disabled={busy}
            t={t}
            onTags={setTags}
            onDraft={setTagDraft}
          />
          <span className="bh-personabot-hint" data-invalid={tagsInvalid ? 'true' : undefined}>
            {t('profile.tags.limit', { max: MAX_BOT_TAGS, length: MAX_BOT_TAG_LENGTH })}
          </span>
        </div>
        <div className="bh-personabot-field">
          <label className="bh-personabot-label" htmlFor={bioId}>
            {t('profile.bio')}
          </label>
          <textarea
            id={bioId}
            className="bh-profile-bio-input"
            rows={3}
            value={bio}
            disabled={busy}
            placeholder={t('profile.bio.placeholder')}
            onChange={(event) => setBio(event.currentTarget.value)}
          />
          <span
            className="bh-personabot-hint bh-profile-bio-count"
            data-invalid={bioLength > MAX_BOT_BIO_LENGTH ? 'true' : undefined}
          >
            {t('profile.bio.count', { count: bioLength, max: MAX_BOT_BIO_LENGTH })}
          </span>
        </div>
        {failed ? (
          <div className="bh-error" role="alert">
            {t('profile.updateFailed')}
          </div>
        ) : null}
      </form>
    </Modal>
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
    <Modal
      open
      onClose={onClose}
      title={t('profile.avatar.section')}
      closeLabel={t('common.close')}
      className="bh-profile-avatar-modal"
    >
      <div className="bh-primary-color-row" data-primary-color-source={primary.source}>
        <span
          className="bh-primary-color-row-swatch"
          style={{ background: primary.color }}
          aria-hidden="true"
        />
        <span className="bh-primary-color-row-copy">
          <span className="bh-primary-color-row-title">{t('profile.primaryColor.title')}</span>
          <span className="bh-personabot-hint">
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
        className="bh-profile-avatar-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const chosen = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (chosen !== undefined) setFile(chosen);
        }}
      />
      {failed ? (
        <div className="bh-error" role="alert">
          {t('profile.avatar.failed')}
        </div>
      ) : null}
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
    </Modal>
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
    <Modal
      open
      onClose={onClose}
      title={t('profile.banner.title')}
      closeLabel={t('common.close')}
      className="bh-sidebar-modal bh-banner-modal"
      footer={
        <div className="bh-modal-footer">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            {t('profile.save')}
          </Button>
        </div>
      }
    >
      <div className="bh-banner-editor">
        <div className="bh-banner-preview">
          <BotBannerArt banner={draft} />
        </div>
        <div className="bh-banner-actions">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || scene === undefined}
            onClick={() =>
              scene !== undefined && setDraft({ recipe: { scene, seed: randomSeed() } })
            }
          >
            {t('profile.banner.reroll')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {t('profile.banner.upload')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setDraft({ recipe: seededBannerRecipe(bot.displayName) })}
          >
            {t('profile.banner.reset')}
          </Button>
        </div>
        {scene === undefined ? (
          <span className="bh-personabot-hint">{t('profile.banner.uploaded')}</span>
        ) : null}
        <div className="bh-banner-scenes" role="radiogroup" aria-label={t('profile.banner.scene')}>
          {BANNER_SCENES.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={scene === option}
              className="bh-banner-scene"
              disabled={busy}
              onClick={() => setDraft({ recipe: { scene: option, seed } })}
            >
              <BotBannerArt banner={{ recipe: { scene: option, seed } }} />
              <span>{t(`profile.banner.scene.${option}`)}</span>
            </button>
          ))}
        </div>
        <input
          ref={input}
          className="bh-profile-avatar-input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const chosen = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (chosen !== undefined) setFile(chosen);
          }}
        />
        {failed ? (
          <div className="bh-error" role="alert">
            {t('profile.banner.failed')}
          </div>
        ) : null}
      </div>
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
    </Modal>
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
  const menuItems: readonly MenuEntry[] = [{ id: 'delete', label: t('deletion.title') }];
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
