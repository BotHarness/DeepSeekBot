import { useRef, useState, type MouseEvent, type KeyboardEvent, type ReactElement } from 'react';
import {
  IconChevronDownOutlineRegular,
  IconChevronLeftOutlineRegular,
  IconCopyOutlineRegular,
  IconDownloadOutlineRegular,
  IconEllipsisOutlineRegular,
  IconFolderOpenOutlineRegular,
  IconRefreshOutlineRegular,
  IconSettingsOutlineRegular,
  Menu,
  Tooltip,
  writeClipboard,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';
import {
  fileOpenScope,
  resolveFileOpenDefault,
  type FileOpenPreference,
  type FileOpenPreferences,
  type FileOpenScope,
} from './file-open-preferences.js';
import type {
  HostFileApplication,
  HostFileOpen,
  HostFileOptions,
  HostFileTarget,
} from './host-file-actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

export interface HostFileCommands {
  target(ownerId: string, targetId: string): Promise<HostFileTarget>;
  applications(ownerId: string, targetId: string): Promise<HostFileOptions>;
  open(ownerId: string, targetId: string, choice: HostFileOpen): Promise<void>;
  download?(ownerId: string, targetId: string): Promise<void>;
  preferences?: FileOpenPreferences | undefined;
}

type MenuRequest = { path: string; x: number; y: number; returnFocus: HTMLElement };
type Feedback = { message: string; tone: 'status' | 'alert' };

const reason = (failure: unknown): string =>
  failure instanceof Error ? failure.message : String(failure);

function scopeText(scope: FileOpenScope, t: BotHarnessTranslate): string {
  if (scope.kind === 'directory') return t('fileAction.scopeDirectory');
  return scope.type === ''
    ? t('fileAction.scopeNoExtension')
    : t('fileAction.scopeFileType', { type: scope.type });
}

function readPreference(
  preferences: FileOpenPreferences | undefined,
  target: HostFileTarget | undefined,
): FileOpenPreference | undefined {
  return preferences === undefined || target === undefined
    ? undefined
    : preferences.get(fileOpenScope(target));
}

function ApplicationIcon({ app }: { app: HostFileApplication }): ReactElement | null {
  return app.icon === null ? null : (
    <img
      className="bh-file-app-icon"
      src={app.icon}
      alt=""
      onError={(event) => {
        event.currentTarget.hidden = true;
      }}
    />
  );
}

function HostFileMenu({
  actions,
  slug,
  request,
  t,
  onClose,
}: {
  actions: HostFileCommands;
  slug: string;
  request: MenuRequest;
  t: BotHarnessTranslate;
  onClose: (message?: string) => void;
}): ReactElement {
  const [target, setTarget] = useState<HostFileTarget>();
  const [options, setOptions] = useState<HostFileOptions>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [defaults, setDefaults] = useState<'loading' | 'ready' | { error: string }>('loading');
  const [choosingDefault, setChoosingDefault] = useState(false);
  const proxy = useRef<HTMLSpanElement>(null);
  const preferences = actions.preferences;
  const mount = useMountedResource<HTMLSpanElement>(() => {
    let active = true;
    void preferences?.ready().then(
      () => {
        if (active) setDefaults('ready');
      },
      (failure: unknown) => {
        if (active) setDefaults({ error: reason(failure) });
      },
    );
    void actions.target(slug, request.path).then(
      async (next) => {
        if (!active) return;
        setTarget(next);
        try {
          const available = await actions.applications(slug, request.path);
          if (active) {
            setOptions(available);
            setError(available.error);
          }
        } catch (failure) {
          if (active) {
            setOptions({ available: false, applications: [] });
            setError(String(failure));
          }
        }
      },
      (failure: unknown) => {
        if (active) setError(failure instanceof Error ? failure.message : String(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [actions, slug, request.path]);
  const focusMenu = useMountedResource<HTMLSpanElement>(() => {
    const timer = window.setTimeout(() => {
      const menus = document.querySelectorAll<HTMLElement>('[role="menu"]');
      menus
        .item(menus.length - 1)
        ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
        ?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [options, error, choosingDefault]);
  const scope = target === undefined ? undefined : fileOpenScope(target);
  const preference = defaults === 'ready' ? readPreference(preferences, target) : undefined;
  const current = options === undefined ? undefined : resolveFileOpenDefault(options, preference);
  const applications = options?.applications ?? [];
  const actionItems: MenuEntry[] = [
    { type: 'label', id: 'host-location', text: t('fileAction.host') },
    ...(current === undefined || options?.available !== true
      ? []
      : [
          {
            type: 'label' as const,
            id: 'default-status',
            text:
              current.source === 'preference'
                ? t('fileAction.defaultYours', { app: current.application.name })
                : current.source === 'system'
                  ? t('fileAction.defaultSystem', { app: current.application.name })
                  : current.source === 'invalid'
                    ? t('fileAction.defaultInvalid', { app: current.preference.name })
                    : t('fileAction.defaultNone'),
          },
        ]),
    ...(target === undefined || options === undefined
      ? [{ type: 'label' as const, id: 'loading', text: error ?? t('fileAction.loading') }]
      : []),
    ...(options?.available === false
      ? [
          {
            type: 'label' as const,
            id: 'unavailable',
            text: t(
              target?.kind === 'directory'
                ? 'fileAction.directoryUnavailable'
                : 'fileAction.unavailable',
            ),
          },
        ]
      : []),
    ...applications.map((app) => ({
      id: `app:${app.id}`,
      label:
        t('fileAction.openIn', { app: app.name }) +
        (current !== undefined && 'application' in current && current.application.id === app.id
          ? t('fileAction.default')
          : ''),
      disabled: busy,
      icon: <ApplicationIcon app={app} />,
    })),
    ...(target?.kind === 'file' && options?.available === true
      ? [
          {
            id: 'reveal',
            label: t('fileAction.reveal'),
            disabled: busy,
            icon: <IconFolderOpenOutlineRegular size={16} />,
          },
        ]
      : []),
    ...(preferences === undefined || scope === undefined || applications.length === 0
      ? []
      : typeof defaults === 'object'
        ? [
            { type: 'separator' as const, id: 'default-separator' },
            {
              type: 'label' as const,
              id: 'defaults-unavailable',
              text: t('fileAction.defaultsUnavailable', { reason: defaults.error }),
            },
          ]
        : defaults === 'loading'
          ? []
          : [
              { type: 'separator' as const, id: 'default-separator' },
              {
                id: 'set-default',
                label: t('fileAction.setDefault', { scope: scopeText(scope, t) }),
                disabled: busy,
                icon: <IconSettingsOutlineRegular size={16} />,
              },
              ...(preference === undefined
                ? []
                : [
                    {
                      id: 'restore',
                      label: t('fileAction.restoreDefault'),
                      disabled: busy,
                      icon: <IconRefreshOutlineRegular size={16} />,
                    },
                  ]),
            ]),
    { type: 'separator', id: 'transfer-separator' },
    ...(target?.kind === 'file' && actions.download !== undefined
      ? [
          {
            id: 'download',
            label: t('fileAction.download'),
            disabled: busy,
            icon: <IconDownloadOutlineRegular size={16} />,
          },
        ]
      : []),
    ...(target === undefined
      ? []
      : [
          {
            id: 'copy',
            label: t('fileAction.copy'),
            disabled: busy,
            icon: <IconCopyOutlineRegular size={16} />,
          },
        ]),
    ...(error === undefined || target === undefined
      ? []
      : [{ type: 'label' as const, id: 'error', text: error }]),
  ];
  const errorItems: MenuEntry[] =
    error === undefined ? [] : [{ type: 'label', id: 'error', text: error }];
  const items: MenuEntry[] =
    !choosingDefault || scope === undefined
      ? actionItems
      : [
          {
            type: 'label',
            id: 'default-heading',
            text: t('fileAction.setDefault', { scope: scopeText(scope, t) }),
          },
          ...applications.map((app) => ({
            id: `default:${app.id}`,
            label: app.name + (preference?.application === app.id ? t('fileAction.default') : ''),
            disabled: busy,
            icon: <ApplicationIcon app={app} />,
          })),
          { type: 'separator', id: 'default-back-separator' },
          {
            id: 'back',
            label: t('fileAction.back'),
            disabled: busy,
            icon: <IconChevronLeftOutlineRegular size={16} />,
          },
          ...errorItems,
        ];
  const select = async (id: string): Promise<void> => {
    if (id === 'set-default' || id === 'back') {
      setError(undefined);
      setChoosingDefault(id === 'set-default');
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      if (id === 'copy') {
        if (target === undefined || !(await writeClipboard(target.path)))
          throw new Error(t('fileAction.copyFailed'));
        onClose(t('fileAction.copied'));
      } else if (id === 'download') {
        await actions.download?.(slug, request.path);
        onClose(t('fileAction.downloadRequested'));
      } else if (id === 'restore' || id.startsWith('default:')) {
        if (preferences === undefined || scope === undefined) return;
        const app = applications.find((item) => `default:${item.id}` === id);
        try {
          if (app === undefined) preferences.clear(scope);
          else preferences.set(scope, { application: app.id, name: app.name });
        } catch (failure) {
          throw new Error(t('fileAction.defaultSaveFailed', { reason: reason(failure) }));
        }
        onClose(
          app === undefined
            ? t('fileAction.defaultRestored', { scope: scopeText(scope, t) })
            : t('fileAction.defaultSaved', { app: app.name, scope: scopeText(scope, t) }),
        );
      } else {
        await actions.open(
          slug,
          request.path,
          id === 'reveal' ? { action: 'reveal' } : { application: id.slice(4) },
        );
        onClose(t('fileAction.dispatched'));
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span ref={mount} className="bh-menu-anchor" style={{ left: request.x, top: request.y }}>
      <span ref={focusMenu} />
      <Menu
        open
        portal
        dense
        autoFocus
        anchor={<span ref={proxy} aria-hidden="true" />}
        getAnchorRect={() => proxy.current?.getBoundingClientRect() ?? null}
        items={items}
        onSelect={(id) => {
          void select(id);
        }}
        onClose={() => {
          if (!busy) onClose();
        }}
      />
    </span>
  );
}

export function useHostFileMenu(
  actions: HostFileCommands | undefined,
  slug: string | undefined,
  t: BotHarnessTranslate,
  transientFeedbackMs?: number,
) {
  const [request, setRequest] = useState<MenuRequest>();
  const [feedback, showFeedback] = useState<Feedback>();
  const feedbackTimer = useRef<number | undefined>(undefined);
  const setFeedback = (next: Feedback | undefined): void => {
    window.clearTimeout(feedbackTimer.current);
    showFeedback(next);
    if (next !== undefined && transientFeedbackMs !== undefined)
      feedbackTimer.current = window.setTimeout(
        () => showFeedback(undefined),
        next.tone === 'alert' ? transientFeedbackMs * 2 : transientFeedbackMs,
      );
  };
  const [revision, setRevision] = useState(0);
  const openAt = (path: string, anchor: HTMLElement): void => {
    if (actions === undefined || slug === undefined) return;
    const rect = anchor.getBoundingClientRect();
    setFeedback(undefined);
    setRequest({ path, x: rect.left, y: rect.bottom, returnFocus: anchor });
  };
  const open = (
    path: string,
    event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
  ): void => {
    if (actions === undefined || slug === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    setFeedback(undefined);
    const anchor =
      event.target instanceof Element
        ? (event.target.closest<HTMLButtonElement>('button') ?? event.currentTarget)
        : event.currentTarget;
    const rect = anchor.getBoundingClientRect();
    const pointer = 'clientX' in event && event.type === 'contextmenu';
    setRequest({
      path,
      x: pointer ? event.clientX : rect.left,
      y: pointer ? event.clientY : rect.bottom,
      returnFocus: anchor,
    });
  };
  const onKey = (path: string, event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) open(path, event);
  };
  const close = (message?: string): void => {
    request?.returnFocus.focus();
    setRequest(undefined);
    setFeedback(message === undefined ? undefined : { message, tone: 'status' });
    setRevision((value) => value + 1);
  };
  return {
    open,
    openAt,
    notify: setFeedback,
    revision,
    onKey,
    isOpen: request !== undefined,
    openTargetId: request?.path,
    menu:
      request === undefined || actions === undefined || slug === undefined ? null : (
        <HostFileMenu
          key={request.path}
          actions={actions}
          slug={slug}
          request={request}
          t={t}
          onClose={close}
        />
      ),
    feedback:
      feedback === undefined ? null : (
        <div
          className={
            (feedback.tone === 'alert' ? 'bh-error' : 'bh-note') + ' bh-file-action-feedback'
          }
          role={feedback.tone}
        >
          {feedback.message}
        </div>
      ),
  };
}

export function HostFileActionButton({
  actions,
  slug,
  path,
  text,
  className,
  t,
}: {
  actions: HostFileCommands;
  slug: string;
  path: string;
  text?: string;
  className?: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const menu = useHostFileMenu(actions, slug, t);
  const button = (
    <button
      type="button"
      className={
        text === undefined
          ? 'bh-memory-view-icon-button'
          : ['bh-file-path-button', className].filter(Boolean).join(' ')
      }
      aria-label={t('fileAction.menu') + ': ' + (text ?? path)}
      aria-haspopup="menu"
      aria-expanded={menu.isOpen}
      title={text}
      onClick={(event) => menu.open(path, event)}
      onContextMenu={(event) => menu.open(path, event)}
      onKeyDown={(event) => menu.onKey(path, event)}
    >
      {text ?? <IconEllipsisOutlineRegular size={16} />}
    </button>
  );
  return (
    <>
      {text === undefined ? (
        <Tooltip label={t('fileAction.menu')} side="bottom" delayMs={500}>
          {button}
        </Tooltip>
      ) : (
        button
      )}
      {menu.menu}
      {menu.feedback}
    </>
  );
}

export function HostFileOpenButton({
  actions,
  slug,
  path,
  name,
  compact = false,
  t,
}: {
  actions: HostFileCommands;
  slug: string;
  path: string;
  name: string;
  compact?: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  const menu = useHostFileMenu(actions, slug, t, 5000);
  const [loaded, setLoaded] = useState<{ target: HostFileTarget; options: HostFileOptions }>();
  const [busy, setBusy] = useState(false);
  const [, setPreferenceRevision] = useState(0);
  const preferences = actions.preferences;
  const mount = useMountedResource<HTMLSpanElement>(
    (node) => {
      let active = true;
      const load = (): void => {
        void (async () => {
          try {
            const target = await actions.target(slug, path);
            const options = await actions.applications(slug, path);
            if (active) setLoaded({ target, options });
          } catch {
            if (active) setLoaded(undefined);
          }
        })();
      };
      const refresh = (): void => {
        if (active) setPreferenceRevision((value) => value + 1);
      };
      void preferences?.ready().then(refresh, refresh);
      const unsubscribe = preferences?.subscribe(refresh);
      let observer: IntersectionObserver | undefined;
      if (typeof IntersectionObserver === 'undefined') load();
      else {
        observer = new IntersectionObserver((entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer?.disconnect();
          load();
        });
        observer.observe(node);
      }
      return () => {
        active = false;
        unsubscribe?.();
        observer?.disconnect();
      };
    },
    [actions, slug, path, menu.revision],
  );
  const current =
    loaded === undefined
      ? undefined
      : resolveFileOpenDefault(loaded.options, readPreference(preferences, loaded.target));
  const app = current !== undefined && 'application' in current ? current.application : undefined;
  const title =
    loaded === undefined || current === undefined
      ? t('fileAction.openHost')
      : !loaded.options.available
        ? t(
            loaded.target.kind === 'directory'
              ? 'fileAction.directoryUnavailable'
              : 'fileAction.unavailable',
          )
        : current.source === 'preference'
          ? t('fileAction.openHostYours', { app: current.application.name })
          : current.source === 'system'
            ? t('fileAction.openHostSystem', { app: current.application.name })
            : current.source === 'invalid'
              ? t('fileAction.defaultInvalid', { app: current.preference.name })
              : t('fileAction.defaultNone');
  const openDefault = async (anchor: HTMLElement): Promise<void> => {
    if (busy) return;
    setBusy(true);
    menu.notify(undefined);
    try {
      const target = await actions.target(slug, path);
      const options = await actions.applications(slug, path);
      await preferences?.ready().catch(() => undefined);
      setLoaded({ target, options });
      const fresh = resolveFileOpenDefault(options, readPreference(preferences, target));
      if ('application' in fresh) {
        await actions.open(slug, path, { application: fresh.application.id });
        menu.notify({ message: t('fileAction.dispatched'), tone: 'status' });
      } else menu.openAt(path, anchor);
    } catch (failure) {
      menu.notify({ message: reason(failure), tone: 'alert' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="bh-file-open-anchor">
      <span
        ref={mount}
        className="bh-file-open"
        data-compact={compact ? '' : undefined}
        data-default={current?.source}
      >
        <Tooltip label={title} side="bottom" delayMs={500}>
          <button
            type="button"
            className="bh-file-open-main"
            aria-label={`${title}: ${name}`}
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              void openDefault(event.currentTarget);
            }}
          >
            {app === undefined || app.icon === null ? (
              <IconFolderOpenOutlineRegular size={16} />
            ) : (
              <ApplicationIcon app={app} />
            )}
            {compact ? null : <span>{t('fileAction.open')}</span>}
          </button>
        </Tooltip>
        <Tooltip label={t('fileAction.chooseApp')} side="bottom" delayMs={500}>
          <button
            type="button"
            className="bh-file-open-more"
            aria-label={`${t('fileAction.chooseApp')}: ${name}`}
            aria-haspopup="menu"
            aria-expanded={menu.isOpen}
            disabled={busy}
            onClick={(event) => menu.open(path, event)}
          >
            <IconChevronDownOutlineRegular size={14} />
          </button>
        </Tooltip>
      </span>
      {menu.menu}
      {menu.feedback}
    </span>
  );
}
