import { useState, type ReactElement } from 'react';
import {
  Button,
  IconCheckOutlineRegular,
  IconInfoOutlineRegular,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives';
import * as stylex from '@stylexjs/stylex';

import type { BridgeActions } from './actions.js';
import { errorMessage } from './bridge.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { Callout } from './ds/callout.js';
import { FieldStack, TextAreaField, TextField } from './ds/field.js';
import { ConfirmDialog, DangerTextButton, FormDialog } from './ds/form-dialog.js';
import { GroupHeading } from './ds/group-heading.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import { Tooltip } from './ds/tooltip.js';
import type { BotHarnessTranslate } from './locale.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';

type PromptActions = Pick<
  BridgeActions,
  | 'promptParts'
  | 'promptPresets'
  | 'promptPresetCreate'
  | 'promptPresetUpdate'
  | 'promptPresetDelete'
  | 'promptGlobalSet'
  | 'botPrompt'
  | 'botPromptSet'
>;
type PartView = NonNullable<
  Awaited<ReturnType<NonNullable<PromptActions['promptParts']>>>
>['parts'][number];
type PresetView = NonNullable<
  Awaited<ReturnType<NonNullable<PromptActions['promptPresets']>>>
>['presets'][number];
type BotPromptView = Awaited<ReturnType<NonNullable<PromptActions['botPrompt']>>>;
type Source = BotPromptView['parts'][number]['source'];
type Layer = Record<string, { text: string; base: string }>;
type Draft = Record<string, string>;

const BUILT_IN = 'built-in';
const FOLLOW = 'global';

const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: space.x4, minWidth: 0 },
  check: { display: 'inline-flex', color: color.fg },
  meta: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.x2 },
  heading: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.x2 },
  info: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: 0,
    border: 'none',
    background: 'none',
    color: color.muted,
    cursor: 'pointer',
  },
  explain: {
    flexBasis: '100%',
    margin: 0,
    padding: space.x3,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    whiteSpace: 'pre-wrap',
  },
  part: {
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.divider,
    borderRadius: radius.sm,
    padding: space.x3,
  },
  summary: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.x2,
    cursor: 'pointer',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  body: { display: 'flex', flexDirection: 'column', gap: space.x2, marginTop: space.x3 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: space.x2 },
  block: {
    margin: 0,
    padding: space.x3,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
});

export function PromptInfo({ info, t }: { info: string; t: BotHarnessTranslate }): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip label={info} side="bottom">
        <button
          type="button"
          {...stylex.props(styles.info)}
          aria-label={t('promptInspect.howItWorks')}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <IconInfoOutlineRegular size={14} />
        </button>
      </Tooltip>
      {open ? <p {...stylex.props(styles.explain)}>{info}</p> : null}
    </>
  );
}

function partLabel(t: BotHarnessTranslate, id: string): string {
  const key = ('prompts.part.' + id) as Parameters<BotHarnessTranslate>[0];
  const label = t(key);
  return label === key ? id : label;
}

function sourceLabel(t: BotHarnessTranslate, source: Source): string {
  if (source === 'bot') return t('prompts.source.bot');
  if (source === 'preset') return t('prompts.source.preset');
  if (source === 'global') return t('prompts.source.global');
  return t('prompts.source.builtIn');
}

function edits(layer: Layer, draft: Draft, inherited: (id: string) => string) {
  const result: Record<string, string | null> = {};
  for (const [id, value] of Object.entries(draft)) {
    if (value.trim() === '' || value === inherited(id)) {
      if (layer[id] !== undefined) result[id] = null;
    } else if (value !== layer[id]?.text) result[id] = value;
  }
  return result;
}

function PartsEditor({
  parts,
  layer,
  draft,
  inherited,
  setDraft,
  t,
}: {
  parts: readonly PartView[];
  layer: Layer;
  draft: Draft;
  inherited: (id: string) => { text: string; source: Source };
  setDraft(next: Draft): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [showDefault, setShowDefault] = useState<string>();
  const group = (kind: PartView['kind']) => {
    const list = parts.filter((part) => part.kind === kind);
    return (
      <section aria-label={t(kind === 'system' ? 'prompts.kind.system' : 'prompts.kind.turn')}>
        <GroupHeading
          quiet
          label={t(kind === 'system' ? 'prompts.kind.system' : 'prompts.kind.turn')}
          count={<Tag tone="neutral">{list.length}</Tag>}
        />
        <FieldStack>
          {list.map((part) => {
            const own = layer[part.id];
            const drafted = draft[part.id];
            const fallback = inherited(part.id);
            const value = drafted ?? own?.text ?? fallback.text;
            const edited = drafted === undefined ? own !== undefined : drafted !== fallback.text;
            const defaultChanged =
              own !== undefined && drafted === undefined && own.base !== part.defaultHash;
            return (
              <details key={part.id} {...stylex.props(styles.part)} data-prompt-part={part.id}>
                <summary {...stylex.props(styles.summary)}>
                  <span>{partLabel(t, part.id)}</span>
                  <Tag tone={edited ? 'success' : 'neutral'}>
                    {edited ? t('prompts.source.here') : sourceLabel(t, fallback.source)}
                  </Tag>
                  {defaultChanged ? <Tag tone="warning">{t('prompts.defaultChanged')}</Tag> : null}
                </summary>
                <div {...stylex.props(styles.body)}>
                  <TextAreaField
                    label={t('prompts.text')}
                    value={value}
                    rows={Math.min(14, Math.max(4, Math.ceil(value.length / 90)))}
                    onChange={(next) => setDraft({ ...draft, [part.id]: next })}
                  />
                  <div {...stylex.props(styles.actions)}>
                    {edited ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDraft({ ...draft, [part.id]: fallback.text })}
                      >
                        {t('prompts.reset', { source: sourceLabel(t, fallback.source) })}
                      </Button>
                    ) : null}
                    {defaultChanged ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setShowDefault(showDefault === part.id ? undefined : part.id)
                        }
                      >
                        {t('prompts.showDefault')}
                      </Button>
                    ) : null}
                  </div>
                  {showDefault === part.id ? (
                    <>
                      <Note>{t('prompts.defaultChangedHint')}</Note>
                      <pre {...stylex.props(styles.block)}>{part.defaultText}</pre>
                    </>
                  ) : null}
                </div>
              </details>
            );
          })}
        </FieldStack>
      </section>
    );
  };
  return (
    <>
      {group('system')}
      {group('turn')}
    </>
  );
}

type Library = { parts: PartView[]; presets: PresetView[]; globalPresetId: string | null };

async function loadLibrary(actions: PromptActions): Promise<Library> {
  const [parts, presets] = await Promise.all([actions.promptParts!(), actions.promptPresets!()]);
  return { parts: parts.parts, ...presets };
}

type Editor =
  | { mode: 'create'; name: string; draft: Draft }
  | { mode: 'edit'; preset: PresetView; name: string; draft: Draft };

export function PromptPresetSettings({
  actions,
  t,
}: {
  actions: PromptActions;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const [library, setLibrary] = useState<Library>();
  const [loadError, setLoadError] = useState<string>();
  const [editor, setEditor] = useState<Editor>();
  const [deleting, setDeleting] = useState<PresetView>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const mount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    if (actions.promptParts !== undefined)
      loadLibrary(actions)
        .then((next) => {
          if (live) setLibrary(next);
        })
        .catch((cause: unknown) => {
          if (live) setLoadError(errorMessage(cause));
        });
    return () => {
      live = false;
    };
  }, [actions]);
  if (actions.promptParts === undefined) return null;

  const close = (): void => {
    setEditor(undefined);
    setDeleting(undefined);
    setError(undefined);
  };
  const run = (operation: () => Promise<unknown>, keepOpen = false): void => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    void operation()
      .then(async () => {
        if (!keepOpen) close();
        setLibrary(await loadLibrary(actions));
      })
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };
  const labels = { close: t('common.close'), cancel: t('common.cancel') };
  const builtIn = (id: string) => ({
    text: library?.parts.find((part) => part.id === id)?.defaultText ?? '',
    source: 'built-in' as Source,
  });

  const dialog = (() => {
    if (library === undefined) return null;
    if (deleting !== undefined)
      return (
        <ConfirmDialog
          title={t('prompts.deleteTitle', { name: deleting.name })}
          labels={labels}
          confirmLabel={t('prompts.delete')}
          busy={busy}
          error={error}
          onCancel={() => setDeleting(undefined)}
          onConfirm={() => run(() => actions.promptPresetDelete!(deleting.id))}
        >
          <Note>{t('prompts.deleteBody')}</Note>
        </ConfirmDialog>
      );
    if (editor === undefined) return null;
    const layer: Layer = editor.mode === 'edit' ? editor.preset.parts : {};
    const changes = edits(layer, editor.draft, (id) => builtIn(id).text);
    const name = editor.name.trim();
    const unchanged =
      editor.mode === 'edit' && name === editor.preset.name && Object.keys(changes).length === 0;
    return (
      <FormDialog
        title={
          editor.mode === 'create'
            ? t('prompts.createTitle')
            : t('prompts.editTitle', { name: editor.preset.name })
        }
        size="wide"
        scroll
        labels={labels}
        submitLabel={editor.mode === 'create' ? t('prompts.create') : t('prompts.save')}
        submitData={{ 'data-prompt-preset-submit': editor.mode }}
        submitDisabled={name === '' || unchanged}
        busy={busy}
        error={error}
        onCancel={close}
        onSubmit={() =>
          run(() =>
            editor.mode === 'create'
              ? actions.promptPresetCreate!(name, changes)
              : actions.promptPresetUpdate!(editor.preset.id, {
                  ...(name === editor.preset.name ? {} : { name }),
                  ...(Object.keys(changes).length === 0 ? {} : { parts: changes }),
                  expectedRevision: editor.preset.revision,
                }),
          )
        }
        secondary={
          editor.mode === 'edit' ? (
            <DangerTextButton
              disabled={busy}
              onClick={() => {
                setError(undefined);
                setDeleting(editor.preset);
              }}
            >
              {t('prompts.delete')}
            </DangerTextButton>
          ) : undefined
        }
      >
        <FieldStack>
          <TextField
            label={t('prompts.name')}
            value={editor.name}
            initialFocus
            autoComplete="off"
            onChange={(next) => setEditor({ ...editor, name: next })}
          />
          <Note>{t('prompts.editorHint')}</Note>
          <PartsEditor
            parts={library.parts}
            layer={layer}
            draft={editor.draft}
            inherited={builtIn}
            setDraft={(draft) => setEditor({ ...editor, draft })}
            t={t}
          />
        </FieldStack>
      </FormDialog>
    );
  })();

  const options = [
    { value: BUILT_IN, label: t('prompts.builtIn') },
    ...(library?.presets ?? []).map((preset) => ({ value: preset.id, label: preset.name })),
  ];
  return (
    <div ref={mount} data-prompt-preset-settings="">
      <SettingsSection
        title={
          <span {...stylex.props(styles.heading)}>
            {t('prompts.title')}
            <PromptInfo info={t('prompts.info')} t={t} />
          </span>
        }
        description={t('prompts.description')}
      >
        {library === undefined ? (
          loadError === undefined ? (
            <LoadingSkeleton kind="sidebar" label={t('prompts.title')} />
          ) : (
            <Note tone="danger">{loadError}</Note>
          )
        ) : (
          <>
            <SettingsRow
              title={t('prompts.global')}
              description={t('prompts.globalHint')}
              data={{ 'data-prompt-global': '' }}
              control={
                <Select
                  label={t('prompts.global')}
                  value={library.globalPresetId ?? BUILT_IN}
                  options={options}
                  disabled={busy}
                  onChange={(value) =>
                    run(() => actions.promptGlobalSet!(value === BUILT_IN ? null : value), true)
                  }
                />
              }
            />
            <SettingsRow
              title={t('prompts.new')}
              data={{ 'data-prompt-preset-new': '' }}
              control={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setError(undefined);
                    setEditor({ mode: 'create', name: '', draft: {} });
                  }}
                >
                  {t('prompts.create')}
                </Button>
              }
            />
            {library.presets.map((preset) => {
              const changed = Object.keys(preset.parts).length;
              const stale = Object.entries(preset.parts).some(
                ([id, part]) =>
                  part.base !== library.parts.find((entry) => entry.id === id)?.defaultHash,
              );
              return (
                <SettingsRow
                  key={preset.id}
                  title={preset.name}
                  data={{ 'data-prompt-preset': preset.id }}
                  description={
                    <span {...stylex.props(styles.meta)}>
                      {preset.id === library.globalPresetId ? (
                        <Tag tone="success">{t('prompts.globalTag')}</Tag>
                      ) : null}
                      {stale ? <Tag tone="warning">{t('prompts.defaultChanged')}</Tag> : null}
                      <span>{t('prompts.changed', { count: changed })}</span>
                    </span>
                  }
                  control={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setError(undefined);
                        setEditor({ mode: 'edit', preset, name: preset.name, draft: {} });
                      }}
                    >
                      {t('prompts.edit')}
                    </Button>
                  }
                />
              );
            })}
            {error === undefined || editor !== undefined || deleting !== undefined ? null : (
              <Note tone="danger">{error}</Note>
            )}
          </>
        )}
      </SettingsSection>
      {dialog}
    </div>
  );
}

type BotState = { library: Library; view: BotPromptView };

export function BotPromptSettingsEntry({
  botSlug,
  actions,
  t,
}: ChannelSidebarEntryProps): ReactElement | null {
  const [state, setState] = useState<BotState>();
  const [loadError, setLoadError] = useState<string>();
  const [draft, setDraft] = useState<Draft>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const load = async (slug: string): Promise<BotState> => {
    const [library, view] = await Promise.all([loadLibrary(actions), actions.botPrompt!(slug)]);
    return { library, view };
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    if (botSlug !== undefined && actions.botPrompt !== undefined)
      load(botSlug)
        .then((next) => {
          if (live) setState(next);
        })
        .catch((cause: unknown) => {
          if (live) setLoadError(errorMessage(cause));
        });
    return () => {
      live = false;
    };
  }, [actions, botSlug]);
  if (botSlug === undefined || actions.botPrompt === undefined) return null;

  const run = (change: Parameters<NonNullable<PromptActions['botPromptSet']>>[1]): void => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    void actions.botPromptSet!(botSlug, change)
      .then(async () => {
        setDraft(undefined);
        setState(await load(botSlug));
      })
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };

  const page = (body: ReactElement) => (
    <div ref={mount} data-bot-prompt-settings="" {...stylex.props(styles.page)}>
      {body}
    </div>
  );
  if (state === undefined)
    return page(
      loadError === undefined ? (
        <LoadingSkeleton kind="sidebar" label={t('prompts.title')} />
      ) : (
        <Note tone="danger">{loadError}</Note>
      ),
    );

  const { library, view } = state;
  const presetOf = (id: string | null) =>
    id === null ? undefined : library.presets.find((preset) => preset.id === id);
  const globalPreset = presetOf(view.globalPresetId);
  const chosen = presetOf(view.presetId);
  const below = (id: string): { text: string; source: Source } => {
    const fromPreset = chosen?.parts[id as keyof typeof chosen.parts];
    if (fromPreset !== undefined) return { text: fromPreset.text, source: 'preset' };
    const fromGlobal = globalPreset?.parts[id as keyof typeof globalPreset.parts];
    if (fromGlobal !== undefined) return { text: fromGlobal.text, source: 'global' };
    return {
      text: library.parts.find((part) => part.id === id)?.defaultText ?? '',
      source: 'built-in',
    };
  };
  const layer: Layer = Object.fromEntries(
    view.parts
      .filter((part) => part.source === 'bot')
      .map((part) => [
        part.id,
        {
          text: part.text,
          base: part.defaultChanged
            ? ''
            : (library.parts.find((entry) => entry.id === part.id)?.defaultHash ?? ''),
        },
      ]),
  );
  const own = Object.keys(layer).length;
  const cards = [
    {
      id: FOLLOW,
      title: t('prompts.bot.follow'),
      meta: t('prompts.bot.followHint', { name: globalPreset?.name ?? t('prompts.builtIn') }),
    },
    ...library.presets.map((preset) => ({
      id: preset.id,
      title: preset.name,
      meta: t('prompts.changed', { count: Object.keys(preset.parts).length }),
    })),
  ];
  const selected = view.presetId ?? FOLLOW;
  const changes = draft === undefined ? {} : edits(layer, draft, (id) => below(id).text);

  return page(
    <>
      <div {...stylex.props(styles.heading)}>
        <Note>{t('prompts.bot.hint')}</Note>
        {view.pending ? <Tag tone="warning">{t('promptInspect.pending')}</Tag> : null}
        <PromptInfo info={t('prompts.info')} t={t} />
      </div>
      {view.pending ? <Note>{t('prompts.pendingHint')}</Note> : null}
      <section aria-label={t('prompts.bot.presets')}>
        <GroupHeading
          quiet
          label={t('prompts.bot.presets')}
          count={<Tag tone="neutral">{cards.length}</Tag>}
        />
        <SidebarCardList label={t('prompts.bot.presets')}>
          {cards.map((card) => {
            const active = card.id === selected;
            return (
              <SidebarCardRow
                key={card.id}
                icon="file-text"
                title={card.title}
                meta={card.meta}
                selection={{ checked: active }}
                disabled={busy}
                trailing={
                  active ? (
                    <span {...stylex.props(styles.check)}>
                      <IconCheckOutlineRegular size={16} />
                    </span>
                  ) : undefined
                }
                {...(active
                  ? {}
                  : { onClick: () => run({ presetId: card.id === FOLLOW ? null : card.id }) })}
              />
            );
          })}
        </SidebarCardList>
      </section>
      <section aria-label={t('prompts.bot.overrides')}>
        <GroupHeading
          quiet
          label={t('prompts.bot.overrides')}
          count={<Tag tone="neutral">{own}</Tag>}
        />
        {draft === undefined ? (
          <SettingsRow
            title={own === 0 ? t('prompts.bot.none') : t('prompts.changed', { count: own })}
            control={
              <Button variant="outline" size="sm" onClick={() => setDraft({})}>
                {t('prompts.edit')}
              </Button>
            }
          />
        ) : (
          <FieldStack>
            <PartsEditor
              parts={library.parts}
              layer={layer}
              draft={draft}
              inherited={below}
              setDraft={setDraft}
              t={t}
            />
            <div {...stylex.props(styles.actions)}>
              <Button
                size="sm"
                disabled={busy || Object.keys(changes).length === 0}
                onClick={() => run({ parts: changes })}
              >
                {t('prompts.save')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setDraft(undefined)}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </FieldStack>
        )}
      </section>
      {view.parts.some((part) => part.source !== 'bot' && part.defaultChanged) ? (
        <Callout tone="muted">{t('prompts.bot.inheritedStale')}</Callout>
      ) : null}
      {error === undefined ? null : <Note tone="danger">{error}</Note>}
    </>,
  );
}
