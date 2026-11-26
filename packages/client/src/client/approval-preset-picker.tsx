import * as stylex from '@stylexjs/stylex';
import { useState, type ReactElement } from 'react';

import {
  templateChoices,
  useApprovalTemplates,
  type TemplateActions,
  type TemplateChoice,
} from './approval-template-entry.js';
import { requestApprovalTemplateCreate } from './approval-template-create-request.js';
import { Button } from './ds/button.js';
import { Icon } from './ds/icon.js';
import { Menu, type MenuEntry } from './ds/menu.js';
import { Tag } from './ds/tag.js';
import { ink, space, type } from './ds/tobs.stylex.js';
import { canOpenSettingsSection, openSettingsSection } from './environment-settings-source.js';
import type { BotHarnessTranslate } from './locale.js';

const OFF = '@off';
const NEW = '@new';
const MANAGE = '@manage';
const SETTINGS_SECTION = 'auto-approval';

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

function choiceKey(selection: string | null): string {
  return selection === null ? OFF : selection;
}

export function ApprovalPresetPicker({
  botSlug,
  actions,
  manage,
  t,
}: {
  botSlug: string;
  actions: TemplateActions;
  manage: boolean;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const state = useApprovalTemplates<HTMLDivElement>(botSlug, actions, true);
  const [open, setOpen] = useState(false);
  const [switched, setSwitched] = useState(false);
  if (!state.available) return null;
  const settings = manage && canOpenSettingsSection();
  const choose = (selection: string | null): void => {
    if (selection === state.selected) return;
    void state.choose(selection).then((saved) => {
      if (saved) setSwitched(true);
    });
  };
  const choices = templateChoices(t, state, t('autoApproval.preset.followGlobal'));
  const ordered: TemplateChoice[] = [
    choices.inherit,
    ...choices.templates,
    ...(choices.missing === undefined ? [] : [choices.missing]),
    choices.off,
  ];
  const item = (choice: TemplateChoice): MenuEntry => ({
    id: choiceKey(choice.selection),
    label:
      choice.detail === undefined ? (
        choice.label
      ) : (
        <>
          {choice.label}
          <span {...stylex.props(styles.secondary)}>{choice.detail}</span>
        </>
      ),
    ...(choice.disabled === true ? { disabled: true } : {}),
  });
  const items: MenuEntry[] = !state.loaded
    ? []
    : [
        { type: 'label', id: 'heading', text: t('autoApproval.preset.menuTitle') },
        ...ordered.map(item),
        ...(settings
          ? [
              { type: 'separator' as const, id: 'manage-separator' },
              { id: NEW, label: t('autoApproval.preset.new') },
              { id: MANAGE, label: t('autoApproval.preset.manage') },
            ]
          : []),
      ];
  const name = ordered.find((choice) => choice.selection === state.selected)?.label ?? '';
  const text = t('autoApproval.preset.trigger', { name });
  return (
    <div
      ref={state.mount}
      data-approval-preset=""
      {...stylex.props(styles.row, !state.loaded && styles.hidden)}
    >
      {!state.loaded ? null : (
        <>
          {state.error === undefined ? null : (
            <span role="alert" {...stylex.props(styles.error)}>
              {state.error}
            </span>
          )}
          {switched && state.error === undefined ? (
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
                disabled={state.busy}
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
            selectedId={choiceKey(state.selected)}
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
