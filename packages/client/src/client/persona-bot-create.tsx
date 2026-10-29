import { useId, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { Button, Input, SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import { BridgeCallError, errorMessage, type CreatedBot } from './bridge.js';
import { Field, TextAreaField, TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import { zhTranslate, type BotHarnessTranslate } from './locale.js';
import { PersonaBotAvatar } from './avatar.js';
import { TagEditor, tagsWithDraft } from './tag-editor.js';

export { normalizeRoleBadges } from './tag-editor.js';

export function personaBotCreateError(
  error: unknown,
  t: BotHarnessTranslate = zhTranslate,
): string {
  if (error instanceof BridgeCallError) {
    switch (error.code) {
      case 'duplicate':
        return t('bot.create.error.identity');
      case 'invalid-input':
        return t('bot.create.error.invalid');
      case 'unavailable':
        return t('bot.create.error.connection');
      case 'git-not-found':
        return t('bot.create.error.gitMissing');
      case 'invalid-git-url':
        return t('bot.create.error.gitUrl');
      case 'git-clone-failed':
        return t('bot.create.error.clone');
      case 'git-clone-timeout':
        return t('bot.create.error.cloneTimeout');
      case 'invalid-memory-dir':
        return t('bot.create.error.memoryLocationMissing');
      case 'memory-unavailable':
        return t('bot.create.error.memoryLocation', { detail: error.message });
    }
  }
  return errorMessage(error);
}

const styles = stylex.create({
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x4,
    minWidth: 0,
  },
  avatar: { display: 'inline-flex', flexShrink: 0 },
  grow: { flexGrow: 1, minWidth: 0 },
  fallback: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x4,
    minWidth: 0,
  },
  code: {
    margin: 0,
    paddingBlock: space.x3,
    paddingInline: space.x4,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
    color: color.fg,
    fontFamily: 'var(--dsw-font-family-mono, monospace)',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  caption: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    marginTop: `calc(-1 * ${space.x2})`,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  detail: {
    fontFamily: 'var(--dsw-font-family-mono, monospace)',
    overflowWrap: 'anywhere',
  },
  advanced: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x4,
    minWidth: 0,
  },
  advancedSummary: {
    cursor: 'pointer',
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    userSelect: 'none',
  },
  advancedBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x4,
    minWidth: 0,
  },
  folderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minWidth: 0,
  },
});

export function isAbsoluteHostPath(path: string): boolean {
  return /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(path);
}

export function CreatePersonaBotModal({
  actions,
  source = 'empty',
  sectionId,
  sectionName,
  t = zhTranslate,
  onCancel,
  onCreated,
}: {
  actions: BridgeActions;
  source?: 'empty' | 'git';
  sectionId?: string;
  sectionName?: string;
  t?: BotHarnessTranslate | undefined;
  onCancel: () => void;
  onCreated: () => void;
}): ReactElement {
  const personaPresetId = useId();
  const [displayName, setDisplayName] = useState('');
  const [personaPreset, setPersonaPreset] = useState<'blank' | 'colleague' | 'roleplay'>('blank');
  const [personaDrafts, setPersonaDrafts] = useState(() => ({
    blank: '',
    colleague: t('bot.create.persona.colleague.seed'),
    roleplay: t('bot.create.persona.roleplay.seed'),
  }));
  const [gitUrl, setGitUrl] = useState('');
  const [roleDraft, setRoleDraft] = useState('');
  const [description, setDescription] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [memoryLocation, setMemoryLocation] = useState('');
  const [pickingFolder, setPickingFolder] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cause, setCause] = useState<unknown | undefined>(undefined);
  const [fallback, setFallback] = useState<CreatedBot | undefined>(undefined);
  const chosenLocation = memoryLocation.trim();
  const locationInvalid = chosenLocation.length > 0 && !isAbsoluteHostPath(chosenLocation);
  const invalid =
    displayName.trim().length === 0 ||
    (source === 'git' && gitUrl.trim().length === 0) ||
    locationInvalid;

  const chooseFolder = (): void => {
    if (pickingFolder || creating) return;
    setPickingFolder(true);
    void actions
      .pickWorkspaceFolder()
      .then(
        (path) => {
          if (path !== null) setMemoryLocation(path);
        },
        (rejection: unknown) => setCause(rejection),
      )
      .finally(() => setPickingFolder(false));
  };

  const rolesWithDraft = (): string[] => tagsWithDraft(roles, roleDraft);

  const submit = (): void => {
    if (invalid || creating) return;
    const submittedRoles = rolesWithDraft();
    const submittedDescription = description.trim();
    setRoles(submittedRoles);
    setRoleDraft('');
    setCreating(true);
    setCause(undefined);
    void actions
      .createBot(
        {
          displayName: displayName.trim(),
          ...(source === 'git'
            ? { gitUrl: gitUrl.trim() }
            : { persona: personaDrafts[personaPreset] }),
          roles: submittedRoles,
          ...(submittedDescription.length === 0 ? {} : { description: submittedDescription }),
          ...(source === 'empty' && chosenLocation.length > 0
            ? { memoryLocation: chosenLocation }
            : {}),
        },
        sectionId,
      )
      .then(
        (created) => {
          setCreating(false);
          if (created.httpsFallback === undefined) onCreated();
          else setFallback(created);
        },
        (rejection: unknown) => {
          setCause(rejection);
          setCreating(false);
        },
      );
  };

  if (fallback?.httpsFallback !== undefined) {
    const { from, to, reason, detail } = fallback.httpsFallback;
    const done = (): void => {
      void actions.openCreatedBot(fallback, sectionId).finally(onCreated);
    };
    return (
      <FormDialog
        title={t('bot.create.httpsFallback.title')}
        labels={{ close: t('common.close'), cancel: t('common.cancel') }}
        submitLabel={t('bot.create.httpsFallback.done')}
        submitData={{ 'data-https-fallback-done': '' }}
        showCancel={false}
        onCancel={done}
        onSubmit={done}
      >
        <div data-https-fallback="" {...stylex.props(styles.fallback)}>
          <span>{t('bot.create.httpsFallback.body')}</span>
          <pre {...stylex.props(styles.code)}>
            <code>{from}</code>
          </pre>
          <span data-https-fallback-reason={reason} {...stylex.props(styles.caption)}>
            {t(`bot.create.httpsFallback.reason.${reason}`)}
            {detail === undefined ? null : (
              <span {...stylex.props(styles.detail)}>
                {t('bot.create.httpsFallback.detail', { detail })}
              </span>
            )}
          </span>
          <span>{t('bot.create.httpsFallback.now')}</span>
          <pre {...stylex.props(styles.code)}>
            <code>{to}</code>
          </pre>
        </div>
      </FormDialog>
    );
  }

  return (
    <FormDialog
      title={
        sectionName === undefined
          ? t(source === 'git' ? 'bot.create.gitTitle' : 'bot.create.title')
          : t(source === 'git' ? 'bot.create.gitInSection' : 'bot.create.inSection', {
              name: sectionName,
            })
      }
      scroll
      description={t('bot.create.description')}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={
        creating
          ? t(source === 'git' ? 'bot.create.importing' : 'bot.create.creating')
          : t('common.create')
      }
      submitDisabled={invalid}
      busy={creating}
      error={
        cause === undefined
          ? undefined
          : t('create.failed', { error: personaBotCreateError(cause, t) })
      }
      onCancel={() => {
        if (!creating) onCancel();
      }}
      onSubmit={submit}
    >
      {source === 'git' ? (
        <TextField
          label={t('bot.create.gitUrl.label')}
          hint={t('bot.create.gitUrl.hint')}
          type="text"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          value={gitUrl}
          disabled={creating}
          placeholder={t('bot.create.gitUrl.placeholder')}
          onChange={setGitUrl}
        />
      ) : null}
      <Field label={t('bot.create.name.label')}>
        {(control) => (
          <div {...stylex.props(styles.nameRow)}>
            <span data-create-avatar-preview="" {...stylex.props(styles.avatar)}>
              <PersonaBotAvatar
                personaBotId=""
                name={displayName.trim() || t('bot.create.name.placeholder')}
                avatarSeed={2}
                size={44}
                indicator={false}
                t={t}
              />
            </span>
            <Input
              {...control}
              data-modal-autofocus=""
              className={stylex.props(styles.grow).className ?? ''}
              value={displayName}
              disabled={creating}
              placeholder={t('bot.create.name.placeholder')}
              onChange={(event) => setDisplayName(event.currentTarget.value)}
            />
          </div>
        )}
      </Field>
      <Field label={t('bot.create.roles.label')} hint={t('bot.create.roles.hint')}>
        {(control) => (
          <TagEditor
            id={control.id}
            tags={roles}
            draft={roleDraft}
            disabled={creating}
            t={t}
            onTags={setRoles}
            onDraft={setRoleDraft}
          />
        )}
      </Field>
      <TextField
        label={t('bot.create.about.label')}
        hint={t('bot.create.about.hint')}
        value={description}
        disabled={creating}
        placeholder={t('bot.create.about.placeholder')}
        onChange={setDescription}
      />
      {source === 'empty' ? (
        <>
          <Field label={t('bot.create.persona.preset')} group>
            {() => (
              <SegmentedControl
                id={personaPresetId}
                label={t('bot.create.persona.preset')}
                value={personaPreset}
                options={[
                  { value: 'blank', label: t('bot.create.persona.blank') },
                  {
                    value: 'colleague',
                    label: t('bot.create.persona.colleague'),
                  },
                  {
                    value: 'roleplay',
                    label: t('bot.create.persona.roleplay'),
                  },
                ]}
                disabled={creating}
                onChange={setPersonaPreset}
              />
            )}
          </Field>
          <TextAreaField
            label={t('bot.create.persona.label')}
            hint={t('bot.create.persona.hint')}
            rows={6}
            value={personaDrafts[personaPreset]}
            disabled={creating}
            placeholder={t('bot.create.persona.placeholder')}
            onChange={(value) =>
              setPersonaDrafts((current) => ({ ...current, [personaPreset]: value }))
            }
          />
          <details data-create-advanced="" {...stylex.props(styles.advanced)}>
            <summary {...stylex.props(styles.advancedSummary)}>{t('bot.create.advanced')}</summary>
            <div {...stylex.props(styles.advancedBody)}>
              <Field
                label={t('bot.create.memoryLocation.label')}
                hint={t('bot.create.memoryLocation.hint')}
                {...(locationInvalid ? { error: t('bot.create.memoryLocation.relative') } : {})}
              >
                {(control) => (
                  <div {...stylex.props(styles.folderRow)}>
                    <Input
                      {...control}
                      className={stylex.props(styles.grow).className ?? ''}
                      value={memoryLocation}
                      disabled={creating}
                      autoCapitalize="none"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={t('bot.create.memoryLocation.placeholder')}
                      onChange={(event) => setMemoryLocation(event.currentTarget.value)}
                    />
                    <Button
                      variant="outline"
                      disabled={creating || pickingFolder}
                      onClick={chooseFolder}
                    >
                      {t('bot.create.memoryLocation.choose')}
                    </Button>
                  </div>
                )}
              </Field>
            </div>
          </details>
        </>
      ) : null}
    </FormDialog>
  );
}
