import {
  INHERIT_APPROVAL_TEMPLATE,
  type ApprovalTemplates,
} from '@botharness/host-client/bot-settings';

import { t } from '../strings';
import { templateTitle } from './approval-template-title';

export interface ApprovalPresetPort {
  load(): Promise<ApprovalTemplates>;
  choose(template: string | null): Promise<void>;
  subscribe?(listener: () => void): () => void;
  manage?(): void;
}

export interface PresetOption {
  key: string;
  value: string | null;
  title: string;
  detail?: string;
  selected: boolean;
  disabled?: boolean;
}

export const TEMPLATE_OFF = '@off';

function namedTemplateLabel(presets: ApprovalTemplates, name: string): string {
  const template = presets.templates.find((item) => item.name === name);
  return template === undefined ? t.autoApprovalUnavailable(name) : templateTitle(template);
}

export function globalTemplateLabel(presets: ApprovalTemplates): string | undefined {
  const name = presets.globalDefault;
  if (name === undefined) return undefined;
  if (name === null) return t.autoApprovalOff;
  return namedTemplateLabel(presets, name);
}

export function effectiveTemplateLabel(presets: ApprovalTemplates): string {
  const name =
    presets.selected === INHERIT_APPROVAL_TEMPLATE ? presets.globalDefault : presets.selected;
  if (name === undefined) return t.autoApprovalFollowGlobal;
  return name === null ? t.autoApprovalNone : namedTemplateLabel(presets, name);
}

export function templateChoices(
  presets: ApprovalTemplates,
  inheritTitle: string,
): {
  inherit: PresetOption;
  off: PresetOption;
  templates: PresetOption[];
  missing: PresetOption | undefined;
} {
  const selected = presets.selected;
  const global = globalTemplateLabel(presets);
  return {
    inherit: {
      key: INHERIT_APPROVAL_TEMPLATE,
      value: INHERIT_APPROVAL_TEMPLATE,
      title: inheritTitle,
      ...(global === undefined ? {} : { detail: global }),
      selected: selected === INHERIT_APPROVAL_TEMPLATE,
    },
    off: { key: TEMPLATE_OFF, value: null, title: t.autoApprovalOff, selected: selected === null },
    templates: presets.templates.map((template) => ({
      key: template.name,
      value: template.name,
      title: templateTitle(template),
      selected: selected === template.name,
    })),
    missing:
      selected !== null &&
      selected !== INHERIT_APPROVAL_TEMPLATE &&
      !presets.templates.some((template) => template.name === selected)
        ? {
            key: selected,
            value: selected,
            title: t.autoApprovalUnavailable(selected),
            selected: true,
            disabled: true,
          }
        : undefined,
  };
}
