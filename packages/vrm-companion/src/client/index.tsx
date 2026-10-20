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
import { clockLabel, solarDay } from './sun.js';
import { panelControls, type PanelControls } from './controls.js';

export const name = 'botharness-vrm-companion-client';
export const inject = ['dockPanels', 'botPresentation'];
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
[data-vrm-loading]{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1;padding:4px 8px;border-radius:var(--dsw-radius-md);color:var(--dsw-alias-label-secondary);background:color-mix(in srgb,var(--dsw-alias-bg-base) 85%,transparent)}
`;
const CAMERAS: Array<[CameraView, string]> = [
  ['desk', 'Desk view'],
  ['room', 'Room view'],
  ['portrait', 'Portrait view'],
];
const MOODS: Array<[Mood, string]> = [
  ['auto', 'Follow system clock'],
  ['sunset', 'Sunset'],
  ['night', 'Night'],
];
const WEATHERS: Array<[Weather, string]> = [
  ['clear', 'Clear'],
  ['rain', 'Rain'],
];
const SHADINGS: Array<[CharacterShading, string]> = [
  ['mtoon', 'MToon'],
  ['liltoon', 'lilToon'],
];
const panelKey = (botId: string, instanceId: string | undefined) =>
  instanceId ?? 'context:' + botId;
const statusText = (snapshot: ReturnType<BotPresentationView['getSnapshot']>) =>
  snapshot.available
    ? snapshot.paused
      ? 'Paused'
      : snapshot.sync === 'live'
        ? snapshot.activity
        : snapshot.sync
    : 'Bot unavailable';
function Character({ view, controls }: { view: BotPresentationView; controls: PanelControls }) {
  const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
  const ui = useSyncExternalStore(controls.subscribe, controls.read, controls.read);
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
        controls.set({ loading: 'Loading character…' });
        void loadModel(controls.botId).then((stored) => {
          controls.restore(stored);
          if (current) controls.retry();
        });
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
          model?.url ?? __VRM_MODEL__,
          {
            loading: (loading) => controls.set({ loading }),
            error: (error) => controls.set({ error }),
            changed: (scene) => controls.set({ scene }),
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
        controls.set({ error: '3D is unavailable. Bot activity and messages remain available.' });
      }
    },
    [view, controls, ui.revision],
  );
  return (
    <section
      data-vrm-panel=""
      aria-label={snapshot.name + ' character'}
      data-vrm-bot={snapshot.botId}
      data-vrm-activity={snapshot.activity}
      data-vrm-speaking={snapshot.speaking}
      data-vrm-conversing={snapshot.conversing}
      data-vrm-model={ui.model ? 'file' : 'sample'}
    >
      <div data-vrm-stage="" ref={mount} />
      {snapshot.attention && (
        <div role="status" data-vrm-attention="">
          {snapshot.attention}
        </div>
      )}
      {ui.loading && !ui.error && (
        <div role="status" data-vrm-loading="">
          {ui.loading}
        </div>
      )}
      {ui.error && (
        <div role="status" data-vrm-error="">
          {ui.error}
          <Button onClick={() => controls.retry()}>Retry character</Button>
        </div>
      )}
      {snapshot.conversing && snapshot.page && (
        <div
          key={snapshot.text.length - snapshot.page.length}
          data-vrm-speech=""
          aria-label="Bot speech"
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
  return (
    <div data-vrm-panel="" ref={mount}>
      {view ? (
        <Character
          key={botId}
          view={view}
          controls={panelControls(panelKey(botId, instanceId), botId)}
        />
      ) : (
        <div role="status">Connecting…</div>
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
    { id: 'model:pick', label: 'Change character…' },
    ...(ui.model
      ? [
          {
            id: 'model:reset',
            label: 'Use default (now ' + ui.model.name + (ui.kept ? ')' : ', this session only)'),
          },
        ]
      : []),
    ...group(
      'shading',
      'Shading',
      SHADINGS.map(([value, label]) => ({ id: 'shading:' + value, label, disabled: !ready })),
    ),
  ];
  const scene: MenuEntry[] = [
    { type: 'label', id: 'view-label', text: 'View' },
    ...CAMERAS.map(([value, label]) => ({ id: 'camera:' + value, label, disabled: !ready })),
    { id: 'camera:reset', label: 'Reset view', disabled: !ready },
    ...group(
      'time',
      'Time',
      MOODS.map(([value, label]) => ({ id: 'mood:' + value, label, disabled: !ready })),
    ),
    {
      type: 'label',
      id: 'time-sun',
      text: `Sunrise ${clockLabel(sun.sunrise)} · Sunset ${clockLabel(sun.sunset)}`,
    },
    ...group(
      'weather',
      'Weather',
      WEATHERS.map(([value, label]) => ({ id: 'weather:' + value, label, disabled: !ready })),
    ),
    ...group('look', 'Look', [
      { id: 'effects:on', label: 'Lo-fi look', disabled: !ready },
      { id: 'effects:off', label: 'Plain', disabled: !ready },
    ]),
    ...group('movement', 'Movement', [
      { id: 'move:sit', label: 'Sit down', disabled: !moving },
      { id: 'move:stand', label: 'Stand up', disabled: !moving },
      {
        id: 'move:wander',
        label: ui.scene.wandering ? 'Stop walking' : 'Walk around',
        disabled: !moving,
      },
    ]),
    ...(instanceId
      ? [
          { type: 'separator' as const, id: 'instance-separator' },
          { id: 'instance:delete', label: 'Delete instance', danger: true },
        ]
      : []),
    { type: 'label', id: 'hint', text: 'Drag to orbit · scroll to zoom' },
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
        <Tag tone={snapshot.attention ? 'warning' : 'quiet'}>{statusText(snapshot)}</Tag>
      </span>
      {ui.failure && (
        <span role="alert">
          <Tag tone="danger">{ui.failure}</Tag>
        </span>
      )}
      <HeaderIcon
        label={ui.tour ? 'Stop camera tour' : 'Auto camera tour'}
        icon={ui.tour ? IconPauseOutlineRegular : IconPlayOutlineRegular}
        pressed={!!ui.tour}
        data="data-vrm-tour-toggle"
        onClick={() => {
          if (ready) controls.tour(!ui.tour);
        }}
      />
      <HeaderMenu
        label="Character"
        icon={IconUserOutlineRegular}
        data="data-vrm-character-menu"
        items={character}
        selectedIds={['shading:' + ui.shading]}
        onSelect={select}
      />
      <HeaderMenu
        label="Scene"
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
          label="Pin character globally"
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
        aria-label="VRM file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) controls.pick(file);
        }}
      />
    </span>
  );
}
export function apply(ctx: Context & PanelServices): void {
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
                controls.set({ failure: 'Could not save the fixed character panel.' });
              }
            }}
            remove={() => {
              try {
                ctx.dockPanels.removeInstance(props.instanceId!);
              } catch {
                controls.set({ failure: 'Could not delete the saved character panel.' });
              }
            }}
          />
        )}
      </span>
    );
  };
  ctx.effect(() =>
    ctx.dockPanels.register({
      id: 'botharness-vrm',
      title: 'VRM Companion',
      icon: 'bot',
      scope: 'channel',
      binding: 'current-bot',
      defaultPosition: { zone: 'right' },
      component: Panel,
      headerAction: Header,
    }),
  );
}
