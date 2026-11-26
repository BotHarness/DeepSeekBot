import * as stylex from '@stylexjs/stylex';
import { useRef, useState, type ReactElement } from 'react';

import { templateTitle } from './approval-template-entry.js';
import { requestApprovalTemplateCreate } from './approval-template-create-request.js';
import type { ApprovalTemplateView } from './bridge.js';
import { errorMessage } from './bridge.js';
import { Button } from './ds/button.js';
import { Icon } from './ds/icon.js';
import { Menu, type MenuEntry } from './ds/menu.js';
import { Tag } from './ds/tag.js';
import { ink, space, type } from './ds/tobs.stylex.js';
import { canOpenSettingsSection, openSettingsSection } from './environment-settings-source.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

export const APPROVAL_PRESET_INHERIT = '@global';
const OFF = '@off';
const NEW = '@new';
const MANAGE = '@manage';
const SETTINGS_SECTION = 'auto-approval';

export interface ApprovalPresetActions {
  approvalTemplates?(slug: string): Promise<{
    templates: ApprovalTemplateView[];
    selected: string | null;
    globalDefault?: string | null;
  }>;
  setBotApprovalTemplate?(slug: string, template: string | null): Promise<void>;
}

interface Presets {
  readonly templates: readonly ApprovalTemplateView[];
  readonly selected: string | null;
  readonly globalDefault: string | null | undefined;
}

const styles = stylex.create({
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space.x3,
    minWidth: 0,
  },
  hidden: { display: 'none' },
  anchor: { maxWidth: '50%', minWidth: 0 },
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x1,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
    paddingBlock: 0,
    paddingInline: 0,
    color: ink.tertiary,
    whiteSpace: 'nowrap',
  },
  label: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  chevron: { display: 'inline-flex', flexShrink: 0 },
  secondary: {
    marginInlineStart: space.x3,
    color: ink.tertiary,
    fontSize: type.captionSize,
  },
  error: { color: ink.secondary, fontSize: type.captionSize, lineHeight: type.captionLine },
});

export function approvalPresetKey(selected: string | null): string {
  return selected === null ? OFF : selected;
}

export function approvalPresetTitle(
  t: BotHarnessTranslate,
  presets: Presets,
  selected: string | null,
): string {
  if (selected === null) return t('autoApproval.off');
  if (selected === APPROVAL_PRESET_INHERIT) return t('autoApproval.preset.followGlobal');
  const template = presets.templates.find((item) => item.name === selected);
  return template === undefined
    ? t('autoApproval.templateMissing', { name: selected })
    : templateTitle(t, template.name, template.title);
}

function globalTitle(t: BotHarnessTranslate, presets: Presets): string | undefined {
  if (presets.globalDefault === undefined) return undefined;
  if (presets.globalDefault === null) return t('autoApproval.off');
  const template = presets.templates.find((item) => item.name === presets.globalDefault);
  return template === undefined
    ? t('autoApproval.templateMissing', { name: presets.globalDefault })
    : templateTitle(t, template.name, template.title);
}

export function ApprovalPresetPicker({
  botSlug,
  actions,
  manage,
  t,
}: {
  botSlug: string;
  actions: ApprovalPresetActions;
  manage: boolean;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const [presets, setPresets] = useState<Presets>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [switched, setSwitched] = useState(false);
  const [error, setError] = useState<string>();
  const live = useRef(false);
  const mount = useMountedResource<HTMLDivElement>(() => {
    live.current = true;
    setPresets(undefined);
    setSwitched(false);
    setError(undefined);
    void actions.approvalTemplates?.(botSlug).then(
      (next) => {
        if (!live.current) return;
        setPresets({
          templates: next.templates,
          selected: next.selected,
          globalDefault: next.globalDefault,
        });
      },
      () => undefined,
    );
    return () => {
      live.current = false;
    };
  }, [actions, botSlug]);
  if (actions.approvalTemplates === undefined || actions.setBotApprovalTemplate === undefined)
    return null;
  const settings = manage && canOpenSettingsSection();
  const choose = (name: string | null): void => {
    if (presets === undefined || busy) return;
    if (name === presets.selected) return;
    const previous = presets;
    setPresets({ ...presets, selected: name });
    setBusy(true);
    setError(undefined);
    void actions.setBotApprovalTemplate!(botSlug, name)
      .then(async () => {
        if (!live.current) return;
        setSwitched(true);
        const next = await actions.approvalTemplates!(botSlug).catch(() => undefined);
        if (next === undefined || !live.current) return;
        setPresets({
          templates: next.templates,
          selected: next.selected,
          globalDefault: next.globalDefault,
        });
      })
      .catch((cause: unknown) => {
        if (!live.current) return;
        setPresets(previous);
        setError(errorMessage(cause));
      })
      .finally(() => {
        if (live.current) setBusy(false);
      });
  };
  const followGlobal = presets === undefined ? undefined : globalTitle(t, presets);
  const items: MenuEntry[] =
    presets === undefined
      ? []
      : [
          { type: 'label', id: 'heading', text: t('autoApproval.preset.menuTitle') },
          {
            id: APPROVAL_PRESET_INHERIT,
            label: (
              <>
                {t('autoApproval.preset.followGlobal')}
                {followGlobal === undefined ? null : (
                  <span {...stylex.props(styles.secondary)}>{followGlobal}</span>
                )}
              </>
            ),
          },
          ...presets.templates.map((template) => ({
            id: template.name,
            label: templateTitle(t, template.name, template.title),
          })),
          ...(presets.selected !== null &&
          presets.selected !== APPROVAL_PRESET_INHERIT &&
          !presets.templates.some((template) => template.name === presets.selected)
            ? [
                {
                  id: presets.selected,
                  label: t('autoApproval.templateMissing', { name: presets.selected }),
                  disabled: true,
                },
              ]
            : []),
          { id: OFF, label: t('autoApproval.off') },
          ...(settings
            ? [
                { type: 'separator' as const, id: 'manage-separator' },
                { id: NEW, label: t('autoApproval.preset.new') },
                { id: MANAGE, label: t('autoApproval.preset.manage') },
              ]
            : []),
        ];
  const name = presets === undefined ? '' : approvalPresetTitle(t, presets, presets.selected);
  const text = t('autoApproval.preset.trigger', { name });
  return (
    <div
      ref={mount}
      data-approval-preset=""
      {...stylex.props(styles.row, presets === undefined && styles.hidden)}
    >
      {presets === undefined ? null : (
        <>
          {error === undefined ? null : (
            <span role="alert" {...stylex.props(styles.error)}>
              {error}
            </span>
          )}
          {switched && error === undefined ? (
            <Tag tone="neutral" data-approval-preset-next="">
              {t('autoApproval.preset.next')}
            </Tag>
          ) : null}
          <Menu
            open={open}
            portal
            compact
            align="end"
            className={stylex.props(styles.anchor).className}
            anchor={
              <Button
                type="button"
                variant="text"
                xstyle={styles.trigger}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={text}
                title={text}
                disabled={busy}
                data-approval-preset-trigger=""
                onClick={() => setOpen((value) => !value)}
              >
                <span {...stylex.props(styles.label)}>{text}</span>
                <span {...stylex.props(styles.chevron)} aria-hidden="true">
                  <Icon name="chevron-down" size={12} />
                </span>
              </Button>
            }
            items={items}
            footer={[{ type: 'label', id: 'note', text: t('autoApproval.preset.note') }]}
            selectedId={approvalPresetKey(presets.selected)}
            onSelect={(id) => {
              setOpen(false);
              if (id === NEW) {
                requestApprovalTemplateCreate(botSlug);
                openSettingsSection(SETTINGS_SECTION);
                return;
              }
              if (id === MANAGE) {
                openSettingsSection(SETTINGS_SECTION);
                return;
              }
              choose(id === OFF ? null : id);
            }}
            onClose={() => setOpen(false)}
          />
        </>
      )}
    </div>
  );
}
