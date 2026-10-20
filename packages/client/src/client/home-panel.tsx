import { TobOnboarding } from './tob-onboarding.js';
import { HomeWelcome } from './home-welcome.js';
import { HomeOverview } from './home-overview.js';
import { ChannelComposer, type ChannelComposerUpload } from './channel-composer.js';
import { hasVisibleText } from '../../../core/src/channels/message-preview.js';
import type { ComposerSendKey } from './composer-send-key.js';
import { uploadChannelAttachment } from './bridge.js';
import { insertAttachmentReferences, removeAttachmentReferences } from './attachment-refs.js';
import { isChannelAttachmentRef } from '../../../core/src/attachments/ref.js';
import { useMountedResource } from './mounted-resource.js';
import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import type { DockPanelRegistry } from './dock-panels.js';
import type { BotHarnessTranslate } from './locale.js';
import { CHANNEL_BODY_PANEL } from './channel-dock-layout.js';
import { OnboardingModelDialog } from './onboarding-view.js';
import { receiveHomeMessages } from './home-requests.js';
import { openModelsSettingsAndReturn } from './bot-settings-open.js';
import { errorMessage } from './bridge.js';
import { color, space, text } from './ds/tokens.stylex.js';

type Home = Awaited<ReturnType<BridgeActions['tobHome']>>;
const styles = stylex.create({
  root: {
    height: '100%',
    overflow: 'auto',
    minWidth: 0,
    display: 'flex',
    alignItems: 'safe center',
    justifyContent: 'center',
    padding: space.x6,
    boxSizing: 'border-box',
  },
  content: {
    width: '100%',
    maxWidth: '1120px',
    display: 'flex',
    flexDirection: 'column',
    gap: space.x5,
    minWidth: 0,
  },
  description: {
    margin: 0,
    color: color.muted,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  prompts: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.x3,
  },
  error: { color: color.danger, margin: 0, overflowWrap: 'anywhere' },
});
export function HomePanel({
  actions,
  registry,
  t,
  sendKey,
  onEditHumanName,
}: {
  actions: BridgeActions;
  registry: DockPanelRegistry;
  t: BotHarnessTranslate;
  sendKey: ComposerSendKey;
  onEditHumanName(): void;
}): ReactElement {
  const [home, setHome] = useState<Home>();
  const [ready, setReady] = useState<boolean>();
  const [configuring, setConfiguring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [storageFailed, setStorageFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const sending = useRef(false);
  const pending = useRef<{ body: string; id: string }>();
  const [focusSignal, setFocusSignal] = useState(0);
  const [uploads, setUploads] = useState<ChannelComposerUpload[]>([]);
  const uploadsRef = useRef<ChannelComposerUpload[]>([]);
  const draftRef = useRef('');
  const uploadControllers = useRef(new Map<string, AbortController>());
  const providerCleanup = useRef<() => void>();
  const restored = useRef<string>();
  const load = async (focus = false): Promise<boolean> => {
    setError(undefined);
    try {
      const next = await actions.tobHome();
      const [catalog, plan] = await Promise.all([
        actions.modelCatalog(),
        actions.modelPlanState(next.botSlug),
      ]);
      const route = plan.plan?.orchestrator ?? catalog.default;
      const usable =
        !plan.repair &&
        !!route &&
        catalog.models.some(
          (model) =>
            model.provider === route.provider && model.model === route.model && !model.credential,
        );
      if (restored.current !== next.botSlug) {
        restored.current = next.botSlug;
        try {
          const key = 'botharness/home-draft/' + next.botSlug;
          const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
          try {
            if (raw && !localStorage.getItem(key)) localStorage.setItem(key, raw);
            sessionStorage.removeItem(key);
            setStorageFailed(false);
          } catch {
            setStorageFailed(true);
          }
          const saved = raw ? JSON.parse(raw) : undefined;
          if (typeof saved?.body === 'string') {
            setDraft(saved.body);
            draftRef.current = saved.body;
            const restoredUploads: ChannelComposerUpload[] = [];
            for (const item of Array.isArray(saved.uploads) ? saved.uploads.slice(0, 10) : []) {
              if (!item || typeof item.id !== 'string') continue;
              const ref = isChannelAttachmentRef(item.ref) ? item.ref : undefined;
              const name = typeof item.name === 'string' ? item.name : ref?.name;
              if (!name) continue;
              restoredUploads.push({
                id: item.id,
                file: new File([], name, { type: ref?.mime ?? item.mime ?? '' }),
                fileAvailable: false,
                status: 'error',
                ...(ref ? { ref } : {}),
              });
            }
            uploadsRef.current = restoredUploads;
            setUploads(restoredUploads);
            if (restoredUploads.some((x) => x.ref)) {
              try {
                const refs = restoredUploads.flatMap((x) => (x.ref ? [x.ref] : []));
                const validated = await actions.validateComposerDraft(next.channelId, refs);
                let index = 0;
                const checked = restoredUploads.map((x) => {
                  if (!x.ref) return x;
                  const ref = validated.attachments[index++];
                  return ref ? { ...x, ref, status: 'ready' as const } : x;
                });
                uploadsRef.current = checked;
                setUploads(checked);
              } catch (cause) {
                setError(errorMessage(cause));
              }
            }
            if (typeof saved.id === 'string') pending.current = { body: saved.body, id: saved.id };
          }
        } catch {}
      }
      setHome(next);
      setReady(usable);
      if (focus && usable) setFocusSignal((value) => value + 1);
      return usable;
    } catch (cause) {
      setError(errorMessage(cause));
      setReady(undefined);
      return false;
    }
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    void load();
    return () => {
      providerCleanup.current?.();
      for (const controller of uploadControllers.current.values()) controller.abort();
    };
  }, [actions]);
  const saveDraft = (body: string) => {
    setDraft(body);
    draftRef.current = body;
    if (pending.current?.body !== body) pending.current = undefined;
    if (home)
      try {
        localStorage.setItem(
          'botharness/home-draft/' + home.botSlug,
          JSON.stringify({
            body,
            ...pending.current,
            uploads: uploadsRef.current.map((x) => ({
              id: x.id,
              name: x.file.name,
              mime: x.file.type,
              ref: x.ref,
            })),
          }),
        );
        setStorageFailed(false);
      } catch {
        setStorageFailed(true);
      }
  };
  const updateUploads = (next: ChannelComposerUpload[]) => {
    pending.current = undefined;
    uploadsRef.current = next;
    setUploads(next);
    saveDraft(draftRef.current);
  };
  const startUpload = (item: ChannelComposerUpload) => {
    if (item.fileAvailable === false) return;
    const controller = new AbortController();
    uploadControllers.current.set(item.id, controller);
    updateUploads(
      uploadsRef.current.map((x) =>
        x.id === item.id ? { ...x, status: 'uploading', error: undefined } : x,
      ),
    );
    void uploadChannelAttachment(item.file, controller.signal, item.id)
      .then((ref) => {
        if (!controller.signal.aborted)
          updateUploads(
            uploadsRef.current.map((x) => (x.id === item.id ? { ...x, status: 'ready', ref } : x)),
          );
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          updateUploads(
            uploadsRef.current.map((x) =>
              x.id === item.id ? { ...x, status: 'error', error: errorMessage(cause) } : x,
            ),
          );
      })
      .finally(() => {
        if (uploadControllers.current.get(item.id) === controller)
          uploadControllers.current.delete(item.id);
      });
  };
  const addFiles = (files: File[], selection?: { start: number; end: number }) => {
    const added = files
      .slice(0, Math.max(0, 10 - uploadsRef.current.length))
      .map((file) => ({ id: crypto.randomUUID(), file, status: 'uploading' as const }));
    const next = insertAttachmentReferences(draftRef.current, added, selection);
    updateUploads([...uploadsRef.current, ...added]);
    saveDraft(next.value);
    for (const item of added) startUpload(item);
    return next.caret;
  };
  const submit = async (text = draft, draftAfterSuccess = '') => {
    const current = uploadsRef.current;
    if (
      !home ||
      !ready ||
      sending.current ||
      (!hasVisibleText(text) && !current.length) ||
      current.some((x) => x.status !== 'ready' || !x.ref)
    )
      return;
    sending.current = true;
    setBusy(true);
    setError(undefined);
    const body = text.trim();
    const request =
      pending.current?.body === body
        ? pending.current
        : { body, id: 'human-' + crypto.randomUUID() };
    pending.current = request;
    try {
      localStorage.setItem(
        'botharness/home-draft/' + home.botSlug,
        JSON.stringify({
          ...request,
          uploads: current.map((x) => ({
            id: x.id,
            name: x.file.name,
            mime: x.file.type,
            ref: x.ref,
          })),
        }),
      );
      setStorageFailed(false);
    } catch {
      setStorageFailed(true);
    }
    try {
      registry.open(CHANNEL_BODY_PANEL);
      await actions.sendHome(
        home.channelId,
        body,
        request.id,
        current.flatMap((x) => (x.ref ? [x.ref] : [])),
      );
      pending.current = undefined;
      uploadsRef.current = [];
      setUploads([]);
      saveDraft(draftAfterSuccess);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  const requests = useMountedResource<HTMLSpanElement>(() => {
    if (!home || ready === undefined) return;
    return receiveHomeMessages((body) => {
      const previous = draftRef.current;
      saveDraft(body);
      if (ready && !uploadsRef.current.length) void submit(body, previous);
      else setFocusSignal((value) => value + 1);
    });
  }, [home, ready]);
  return (
    <div ref={mount} {...stylex.props(styles.root)} data-home-panel>
      <span ref={requests} hidden aria-hidden="true" />
      <div {...stylex.props(styles.content)}>
        <HomeWelcome
          actions={actions}
          botSlug={home?.botSlug}
          t={t}
          onEditHumanName={onEditHumanName}
        />
        <p {...stylex.props(styles.description)}>{t('home.description')}</p>
        {ready === undefined ? (
          <Button variant="ghost" onClick={() => void load()}>
            {error ? t('activityInbox.retry') : t('modelPreset.loading')}
          </Button>
        ) : !ready ? (
          <Button variant="primary" onClick={() => setConfiguring(true)}>
            {t('home.configure')}
          </Button>
        ) : (
          <ChannelComposer
            value={draft}
            placeholder={t('home.input')}
            sendKey={sendKey}
            sending={busy}
            focusSignal={focusSignal}
            attachments={uploads}
            onAddFiles={addFiles}
            onRetryAttachment={(id) => {
              const item = uploads.find((x) => x.id === id);
              if (item) startUpload(item);
            }}
            onRemoveAttachment={(id) => {
              const item = uploads.find((x) => x.id === id);
              if (!item) return;
              const next = removeAttachmentReferences(draftRef.current, item);
              uploadControllers.current.get(id)?.abort();
              uploadControllers.current.delete(id);
              updateUploads(uploadsRef.current.filter((x) => x.id !== id));
              saveDraft(next.value);
            }}
            t={t}
            onChange={saveDraft}
            onSubmit={() => submit()}
          />
        )}
        <TobOnboarding
          actions={actions}
          t={t}
          ready={ready === true}
          hasDraft={!!draft.trim() || uploads.length > 0}
          openChannel={(id) => {
            registry.open(CHANNEL_BODY_PANEL);
            void actions.openChannel(id);
          }}
          suggest={(body) => {
            saveDraft(body);
            setFocusSignal((value) => value + 1);
          }}
        />
        <div {...stylex.props(styles.prompts)} aria-label={t('home.starters')}>
          {(['create', 'status', 'action', 'memory'] as const).map((key) => (
            <Button
              key={key}
              variant="ghost"
              disabled={!ready || busy}
              onClick={() => {
                saveDraft(t(`home.starter.${key}`));
                setFocusSignal((value) => value + 1);
              }}
            >
              {t(`home.starter.${key}`)}
            </Button>
          ))}
        </div>
        <HomeOverview actions={actions} registry={registry} t={t} />
        {storageFailed && (
          <p role="alert" {...stylex.props(styles.error)}>
            {t('home.draftStorageError')}
          </p>
        )}
        {error && (
          <p role="alert" {...stylex.props(styles.error)}>
            {error}
          </p>
        )}
      </div>
      {configuring && (
        <OnboardingModelDialog
          actions={actions}
          globalOnly
          title={t('home.configure')}
          t={t}
          onClose={() => {
            setConfiguring(false);
            void load(true);
          }}
          onConfirm={async (route) => {
            await actions.onboardingModel(undefined, 0, route, true);
            if (await load(true)) setConfiguring(false);
          }}
          onProviderSettings={() => {
            setConfiguring(false);
            providerCleanup.current?.();
            providerCleanup.current = openModelsSettingsAndReturn(() => {
              void load(true).then((usable) => {
                if (!usable) setConfiguring(true);
              });
            });
          }}
        />
      )}
    </div>
  );
}
