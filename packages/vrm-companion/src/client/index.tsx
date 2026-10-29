import type { Context } from '@deepseek-ai/cordis';
import { useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  Button,
  IconPauseOutlineRegular,
  IconPinOutlineRegular,
  IconPlayOutlineRegular,
  IconSlidersTwoOutlineRegular,
  IconUserOutlineRegular,
  Menu,
  Tag,
  Tooltip,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  BotPresentation,
  BotPresentationView,
  DockPanelProps,
  PanelServices,
} from '@botharness/ui/panels';
import { mountStage, type CameraView } from './stage.js';
import type { Mood, Weather } from './room.js';
import type { CharacterShading } from './shading.js';
import { loadModel } from './library.js';
import { defaultModel } from './default-model.js';
import { clockLabel, solarDay } from './sun.js';
import { panelControls, type PanelControls } from './controls.js';
import {
  LOCALE_NS,
  en,
  english,
  loadingText,
  presence,
  problemText,
  zh,
  type Translate,
} from './copy.js';

export const name = 'botharness-vrm-companion-client';
export const inject = ['dockPanels', 'botPresentation', 'locale'];

interface LocaleRuntime {
  bind(namespace: string): Translate;
  register(namespace: string, dictionaries: { zh: typeof zh; en: typeof en }): () => void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): unknown;
}
const i18n = {
  t: english,
  subscribe: (_: () => void) => () => {},
  snapshot: (): unknown => undefined,
};
function useT() {
  useSyncExternalStore(i18n.subscribe, i18n.snapshot, i18n.snapshot);
  return i18n.t;
}
const CSS = `
[data-vrm-panel]{position:relative;height:100%;min-height:0;display:flex;flex-direction:column;color:var(--dsw-alias-label-primary);font:inherit}
[data-vrm-panel] > [data-vrm-panel]{flex:1;height:auto}
[data-vrm-stage]{position:absolute;inset:0;overflow:hidden}
[data-vrm-status]{color:var(--dsw-alias-label-secondary)}
[data-vrm-header-actions]{display:inline-flex;align-items:center;gap:2px;min-width:0}
[data-vrm-header-actions] [data-vrm-icon]{width:28px;padding:0;color:var(--dsw-alias-label-tertiary)}
[data-vrm-header-actions] [data-vrm-icon]:hover,[data-vrm-header-actions] [data-vrm-icon][aria-expanded=true],[data-vrm-header-actions] [data-vrm-icon][aria-pressed=true]{color:var(--dsw-alias-label-primary)}
[data-vrm-header-actions] > [data-vrm-activity-tag]{margin-right:4px}
[data-vrm-header-actions] > [data-vrm-activity-tag]{max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-vrm-attention]{position:absolute;top:12px;left:12px;right:12px;z-index:1;padding:4px 8px;border-radius:var(--dsw-radius-md);background:color-mix(in srgb,var(--dsw-alias-bg-base) 85%,transparent)}
[data-vrm-speech]{--vrm-bubble-width:min(300px,calc(var(--vrm-panel-width,100vw) - 24px));--vrm-bubble-left:clamp(12px,calc(var(--vrm-head-x,70vw) - 150px),calc(var(--vrm-panel-width,100vw) - var(--vrm-bubble-width) - 12px));position:absolute;z-index:1;left:var(--vrm-bubble-left);bottom:clamp(12px,calc(100% - var(--vrm-head-y,35%) + 22px),calc(100% - 72px));width:var(--vrm-bubble-width);max-height:max(72px,calc(var(--vrm-head-y,35%) - 34px));box-sizing:border-box;display:flex;flex-direction:column;gap:4px;padding:10px 14px;border:1px solid var(--dsw-alias-label-primary);border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 8px 22px color-mix(in srgb,var(--dsw-alias-label-primary) 16%,transparent);transform-origin:calc(var(--vrm-head-x,70vw) - var(--vrm-bubble-left)) calc(100% + 10px);animation:vrm-speech-in .22s cubic-bezier(.2,.9,.3,1.2)}
[data-vrm-speech]::before,[data-vrm-speech]::after{content:'';position:absolute;left:clamp(14px,calc(var(--vrm-head-x,70vw) - var(--vrm-bubble-left) - 11px),calc(var(--vrm-bubble-width) - 36px));bottom:-11px;width:22px;height:11.5px;pointer-events:none}
[data-vrm-speech]::before{background:var(--dsw-alias-label-primary);clip-path:path('M0 0.5 L8.9 9.4 Q11 11.5 13.1 9.4 L22 0.5 Z')}
[data-vrm-speech]::after{background:var(--dsw-alias-bg-base);clip-path:path('M2.6 0 L10.5 7.9 Q11 8.4 11.5 7.9 L19.4 0 Z')}
[data-vrm-speech] > small{font-family:var(--dsw-font-markdown-code-block-font-family);color:var(--dsw-alias-label-secondary)}
[data-vrm-speech] > p{margin:0;min-height:0;max-height:7.5em;display:flex;flex-direction:column-reverse;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}
@keyframes vrm-speech-in{from{opacity:0;transform:scale(.92) translateY(6px)}}
@media (prefers-reduced-motion:reduce){[data-vrm-speech]{animation:none}}
[data-vrm-error]{position:absolute;inset:35% 12px auto;z-index:2;background:var(--dsw-alias-bg-base);padding:12px}
[data-vrm-software]{position:absolute;left:12px;right:12px;bottom:16px;z-index:2;display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:14px 16px;border-radius:var(--dsw-radius-panel);background:color-mix(in srgb,var(--dsw-alias-bg-base) 88%,transparent);box-shadow:0 8px 22px color-mix(in srgb,var(--dsw-alias-label-primary) 14%,transparent)}
[data-vrm-software] > p{margin:0;line-height:1.5}
[data-vrm-poster]{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:62% center;pointer-events:none}
[data-vrm-poster=blur]{filter:blur(6px) brightness(.75);transform:scale(1.04)}
[data-vrm-loading]{position:absolute;left:50%;bottom:18%;transform:translateX(-50%);z-index:1;display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;white-space:nowrap;color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-bg-base) 80%,transparent);animation:vrm-fade-in .3s ease-out}
[data-vrm-dots]{display:inline-flex;gap:3px}
[data-vrm-dots] > i{width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.35;animation:vrm-dot 1.2s ease-in-out infinite}
[data-vrm-dots] > i:nth-child(2){animation-delay:.15s}
[data-vrm-dots] > i:nth-child(3){animation-delay:.3s}
@keyframes vrm-dot{0%,60%,100%{opacity:.35;transform:none}30%{opacity:1;transform:translateY(-3px)}}
@keyframes vrm-fade-in{from{opacity:0}}
@media (prefers-reduced-motion:reduce){[data-vrm-dots] > i,[data-vrm-loading]{animation:none}[data-vrm-stage] canvas{transition:none!important}}
`;
const CAMERAS: Array<[CameraView, string]> = [
  ['desk', 'menu.view.desk'],
  ['room', 'menu.view.room'],
  ['portrait', 'menu.view.portrait'],
];
const MOODS: Array<[Mood, string]> = [
  ['auto', 'menu.time.auto'],
  ['sunset', 'menu.time.sunset'],
  ['night', 'menu.time.night'],
];
const WEATHERS: Array<[Weather, string]> = [
  ['clear', 'menu.weather.clear'],
  ['rain', 'menu.weather.rain'],
];
const SHADINGS: Array<[CharacterShading, string]> = [
  ['mtoon', 'MToon'],
  ['liltoon', 'lilToon'],
];
const panelKey = (botId: string, instanceId: string | undefined) =>
  instanceId ?? 'context:' + botId;
function Character({ view, controls }: { view: BotPresentationView; controls: PanelControls }) {
  const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
  const ui = useSyncExternalStore(controls.subscribe, controls.read, controls.read);
  const t = useT();
  const problem = problemText(t, ui.error, snapshot.name);
  const poster = controls.poster() ?? (ui.model ? undefined : __VRM_POSTER__);
  const cleanup = useRef<(() => void) | undefined>();
  const mount = useCallback(
    (node: HTMLDivElement | null) => {
      cleanup.current?.();
      cleanup.current = undefined;
      controls.stage = undefined;
      if (!node) return;
      if (!controls.known()) {
        let current = true;
        cleanup.current = () => {
          current = false;
        };
        controls.set({ loading: 'signing-in' });
        void loadModel(controls.botId).then((stored) => {
          controls.restore(stored);
          if (current) controls.retry();
        });
        return;
      }
      if (controls.software()) {
        controls.set({ software: true, loading: '' });
        return;
      }
      try {
        const choices = controls.choices();
        const model = controls.read().model;
        controls.set({
          ...choices,
          error: '',
          scene: { phase: 'seated', wandering: false, ready: false },
        });
        const stage = mountStage(
          node,
          model ? async () => model.url : defaultModel,
          {
            loading: (loading) => controls.set({ loading }),
            error: (error) => controls.set({ error }),
            changed: (scene) => controls.set({ scene }),
            poster: (url) => controls.keepPoster(url),
          },
          choices,
          { headphones: !model },
        );
        controls.stage = stage;
        const update = () => stage.update(view.getSnapshot());
        update();
        const unsubscribe = view.subscribe(update);
        cleanup.current = () => {
          unsubscribe();
          stage.dispose();
          if (controls.stage === stage) controls.stage = undefined;
        };
      } catch {
        controls.set({ error: 'unavailable' });
      }
    },
    [view, controls, ui.revision],
  );
  return (
    <section
      data-vrm-panel=""
      aria-label={t('panel.character', { name: snapshot.name })}
      data-vrm-bot={snapshot.botId}
      data-vrm-activity={snapshot.activity}
      data-vrm-speaking={snapshot.speaking}
      data-vrm-conversing={snapshot.conversing}
      data-vrm-model={ui.model ? 'file' : 'sample'}
    >
      {(ui.software || ui.loading || problem) && poster && (
        <img data-vrm-poster={ui.software ? 'still' : 'blur'} src={poster} alt="" />
      )}
      <div data-vrm-stage="" ref={mount} />
      {snapshot.attention && (
        <div role="status" data-vrm-attention="">
          {snapshot.attention}
        </div>
      )}
      {ui.software && (
        <div role="status" data-vrm-software="">
          <p>{t('software.text', { name: snapshot.name })}</p>
          <Button variant="primary" size="sm" onClick={() => controls.force()}>
            {t('software.action')}
          </Button>
        </div>
      )}
      {ui.loading && !problem && (
        <div role="status" data-vrm-loading="">
          <span data-vrm-dots="" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {loadingText(t, ui.loading, snapshot.name)}
        </div>
      )}
      {problem && (
        <div role="status" data-vrm-error="">
          {problem.text}
          <Button onClick={() => controls.retry()}>{problem.action}</Button>
        </div>
      )}
      {snapshot.conversing && snapshot.page && (
        <div
          key={snapshot.text.length - snapshot.page.length}
          data-vrm-speech=""
          aria-label={t('panel.speech')}
        >
          <small>{snapshot.name}</small>
          <p>{snapshot.page}</p>
        </div>
      )}
    </section>
  );
}
function useView(presentation: BotPresentation, botId: string) {
  const [view, setView] = useState<BotPresentationView>();
  const cleanup = useRef<(() => void) | undefined>();
  const mount = useCallback(
    (node: HTMLElement | null) => {
      cleanup.current?.();
      cleanup.current = undefined;
      if (!node) return;
      const current = presentation.acquire(botId);
      cleanup.current = current.dispose;
      setView(current);
    },
    [botId, presentation],
  );
  return [view, mount] as const;
}
function BoundCharacter({
  botId,
  instanceId,
  presentation,
}: {
  botId: string;
  instanceId: string | undefined;
  presentation: BotPresentation;
}) {
  const [view, mount] = useView(presentation, botId);
  const t = useT();
  return (
    <div data-vrm-panel="" ref={mount}>
      {view ? (
        <Character
          key={botId}
          view={view}
          controls={panelControls(panelKey(botId, instanceId), botId)}
        />
      ) : (
        <div role="status">{t('loading.connecting')}</div>
      )}
    </div>
  );
}
type IconComponent = (props: { size?: number }) => ReactNode;

function HeaderIcon({
  label,
  icon: Icon,
  pressed,
  open,
  data,
  onClick,
}: {
  label: string;
  icon: IconComponent;
  pressed?: boolean;
  open?: boolean;
  data: string;
  onClick: () => void;
}) {
  return (
    <Tooltip label={label} side="bottom" delayMs={500}>
      <Button
        size="sm"
        variant="ghost"
        aria-label={label}
        aria-pressed={pressed}
        aria-haspopup={open === undefined ? undefined : 'menu'}
        aria-expanded={open}
        data-vrm-icon=""
        {...{ [data]: '' }}
        icon={<Icon size={16} />}
        onClick={onClick}
      />
    </Tooltip>
  );
}

function HeaderMenu({
  label,
  icon,
  data,
  items,
  selectedIds,
  onSelect,
}: {
  label: string;
  icon: IconComponent;
  data: string;
  items: MenuEntry[];
  selectedIds: string[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Menu
      open={open}
      anchor={
        <HeaderIcon
          label={label}
          icon={icon}
          open={open}
          data={data}
          onClick={() => setOpen(!open)}
        />
      }
      items={items}
      selectedIds={selectedIds}
      onSelect={(id) => {
        setOpen(false);
        onSelect(id);
      }}
      onClose={() => setOpen(false)}
      align="end"
      portal
      compact
      dense
    />
  );
}

function SceneMenu({
  view,
  controls,
  instanceId,
  pin,
  remove,
}: {
  view: BotPresentationView;
  controls: PanelControls;
  instanceId: string | undefined;
  pin: () => void;
  remove: () => void;
}) {
  const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
  const ui = useSyncExternalStore(controls.subscribe, controls.read, controls.read);
  const t = useT();
  const picker = useRef<HTMLInputElement>(null);
  const ready = ui.scene.ready;
  const sun = solarDay(new Date());
  const moving = ready && snapshot.sync === 'live' && !snapshot.paused && snapshot.available;
  const group = (id: string, text: string, rows: MenuEntry[]): MenuEntry[] => [
    { type: 'separator', id: id + '-separator' },
    { type: 'label', id: id + '-label', text },
    ...rows,
  ];
  const character: MenuEntry[] = [
    { id: 'model:pick', label: t('menu.pick') },
    ...(ui.model
      ? [
          {
            id: 'model:reset',
            label: t(ui.kept ? 'menu.useDefault' : 'menu.useDefaultSession', {
              name: ui.model.name,
            }),
          },
        ]
      : []),
    ...group(
      'shading',
      t('menu.shading'),
      SHADINGS.map(([value, label]) => ({ id: 'shading:' + value, label, disabled: !ready })),
    ),
  ];
  const scene: MenuEntry[] = [
    { type: 'label', id: 'view-label', text: t('menu.view') },
    ...CAMERAS.map(([value, key]) => ({ id: 'camera:' + value, label: t(key), disabled: !ready })),
    { id: 'camera:reset', label: t('menu.view.reset'), disabled: !ready },
    ...group(
      'time',
      t('menu.time'),
      MOODS.map(([value, key]) => ({ id: 'mood:' + value, label: t(key), disabled: !ready })),
    ),
    {
      type: 'label',
      id: 'time-sun',
      text: t('menu.sun', { sunrise: clockLabel(sun.sunrise), sunset: clockLabel(sun.sunset) }),
    },
    ...group(
      'weather',
      t('menu.weather'),
      WEATHERS.map(([value, key]) => ({ id: 'weather:' + value, label: t(key), disabled: !ready })),
    ),
    ...group('look', t('menu.look'), [
      { id: 'effects:on', label: t('menu.look.lofi'), disabled: !ready },
      { id: 'effects:off', label: t('menu.look.plain'), disabled: !ready },
    ]),
    ...group('movement', t('menu.movement'), [
      { id: 'move:sit', label: t('menu.move.sit'), disabled: !moving },
      { id: 'move:stand', label: t('menu.move.stand'), disabled: !moving },
      {
        id: 'move:wander',
        label: t(ui.scene.wandering ? 'menu.move.stop' : 'menu.move.wander'),
        disabled: !moving,
      },
    ]),
    ...(instanceId
      ? [
          { type: 'separator' as const, id: 'instance-separator' },
          { id: 'instance:delete', label: t('menu.delete'), danger: true },
        ]
      : []),
    { type: 'label', id: 'hint', text: t('menu.hint') },
  ];
  const select = (id: string) => {
    const [kind, value] = id.split(':') as [string, string];
    if (kind === 'model' && value === 'pick') picker.current?.click();
    else if (kind === 'model' && value === 'reset') controls.reset();
    else if (kind === 'shading') controls.shading(value as CharacterShading);
    else if (kind === 'camera')
      controls.camera(value === 'reset' ? ui.camera : (value as CameraView));
    else if (kind === 'mood') controls.mood(value as Mood);
    else if (kind === 'weather') controls.weather(value as Weather);
    else if (kind === 'effects') controls.effects(value === 'on');
    else if (kind === 'move')
      controls.stage?.command(value === 'sit' ? 'sit' : value === 'stand' ? 'stand' : 'wander');
    else if (id === 'instance:delete') remove();
  };
  return (
    <span data-vrm-header-actions="" data-vrm-phase={ui.scene.phase}>
      <span data-vrm-activity-tag="" role="status" title={snapshot.attention}>
        <Tag tone={snapshot.attention ? 'warning' : 'quiet'}>{presence(t, snapshot)}</Tag>
      </span>
      {ui.failure && (
        <span role="alert">
          <Tag tone="danger">{t('failure.' + ui.failure)}</Tag>
        </span>
      )}
      <HeaderIcon
        label={t(ui.tour ? 'menu.tourStop' : 'menu.tour')}
        icon={ui.tour ? IconPauseOutlineRegular : IconPlayOutlineRegular}
        pressed={!!ui.tour}
        data="data-vrm-tour-toggle"
        onClick={() => {
          if (ready) controls.tour(!ui.tour);
        }}
      />
      <HeaderMenu
        label={t('menu.character')}
        icon={IconUserOutlineRegular}
        data="data-vrm-character-menu"
        items={character}
        selectedIds={['shading:' + ui.shading]}
        onSelect={select}
      />
      <HeaderMenu
        label={t('menu.scene')}
        icon={IconSlidersTwoOutlineRegular}
        data="data-vrm-scene-menu"
        items={scene}
        selectedIds={[
          ...(ui.tour ? [] : ['camera:' + ui.camera]),
          'mood:' + ui.mood,
          'weather:' + ui.weather,
          ui.effects ? 'effects:on' : 'effects:off',
        ]}
        onSelect={select}
      />
      {!instanceId && (
        <HeaderIcon
          label={t('menu.pin')}
          icon={IconPinOutlineRegular}
          data="data-vrm-pin"
          onClick={pin}
        />
      )}
      <input
        ref={picker}
        type="file"
        accept=".vrm,model/gltf-binary"
        hidden
        aria-label={t('panel.file')}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) controls.pick(file);
        }}
      />
    </span>
  );
}
export function apply(ctx: Context & PanelServices & { locale: LocaleRuntime }): void {
  ctx.effect(() => {
    const release = ctx.locale.register(LOCALE_NS, { zh, en });
    i18n.t = ctx.locale.bind(LOCALE_NS);
    i18n.subscribe = (listener) => ctx.locale.subscribe(listener);
    i18n.snapshot = () => ctx.locale.getSnapshot();
    return () => {
      release();
      i18n.t = english;
      i18n.subscribe = () => () => {};
      i18n.snapshot = () => undefined;
    };
  });
  ctx.effect(() => {
    const style = document.createElement('style');
    style.dataset.plugin = '@botharness/vrm-companion';
    style.textContent = CSS;
    document.head.append(style);
    return () => style.remove();
  });
  const bindingOf = ({ channel, botId }: DockPanelProps) =>
    botId ?? (channel?.type === 'dm' ? channel.botSlug : undefined);
  const Panel = (props: DockPanelProps) => {
    const binding = bindingOf(props);
    return binding ? (
      <BoundCharacter
        key={binding}
        botId={binding}
        instanceId={props.instanceId}
        presentation={ctx.botPresentation}
      />
    ) : null;
  };
  const Header = (props: DockPanelProps) => {
    const binding = bindingOf(props);
    const [view, mount] = useView(ctx.botPresentation, binding ?? '');
    if (!binding) return null;
    const controls = panelControls(panelKey(binding, props.instanceId), binding);
    return (
      <span ref={mount} data-vrm-header="">
        {view && (
          <SceneMenu
            view={view}
            controls={controls}
            instanceId={props.instanceId}
            pin={() => {
              try {
                ctx.dockPanels.createInstance(
                  'botharness-vrm',
                  binding,
                  ctx.botPresentation.bots().find((b) => b.id === binding)?.name ?? binding,
                );
                controls.set({ failure: '' });
              } catch {
                controls.set({ failure: 'pin' });
              }
            }}
            remove={() => {
              try {
                ctx.dockPanels.removeInstance(props.instanceId!);
              } catch {
                controls.set({ failure: 'remove' });
              }
            }}
          />
        )}
      </span>
    );
  };
  ctx.effect(() => {
    let title = '';
    let release = () => {};
    const reconcile = () => {
      const next = i18n.t('panel.title');
      if (next === title) return;
      title = next;
      release();
      release = ctx.dockPanels.register({
        id: 'botharness-vrm',
        title,
        icon: 'bot',
        scope: 'channel',
        binding: 'current-bot',
        defaultPosition: { zone: 'right' },
        component: Panel,
        headerAction: Header,
      });
    };
    reconcile();
    const unsubscribe = ctx.locale.subscribe(reconcile);
    return () => {
      unsubscribe();
      release();
    };
  });
}
