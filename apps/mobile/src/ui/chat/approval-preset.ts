import {
  INHERIT_APPROVAL_TEMPLATE,
  type ApprovalTemplates,
} from '@botharness/host-client/bot-settings';

import { t } from '../strings';
import { templateTitle } from './approval-template-title';

export interface ApprovalPresetPort {
  load(): Promise<ApprovalTemplates>;
  choose(template: string | null): Promise<void>;
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

const OFF = '@off';

function globalTitle(presets: ApprovalTemplates): string | undefined {
  const name = presets.globalDefault;
  if (name === undefined) return undefined;
  if (name === null) return t.autoApprovalOff;
  const template = presets.templates.find((item) => item.name === name);
  return template === undefined ? t.autoApprovalUnavailable(name) : templateTitle(template);
}

export function presetName(presets: ApprovalTemplates): string {
  const selected = presets.selected;
  if (selected === null) return t.autoApprovalOff;
  if (selected === INHERIT_APPROVAL_TEMPLATE) return t.autoApprovalFollowGlobal;
  const template = presets.templates.find((item) => item.name === selected);
  return template === undefined ? t.autoApprovalUnavailable(selected) : templateTitle(template);
}

export function presetOptions(presets: ApprovalTemplates): PresetOption[] {
  const global = globalTitle(presets);
  const missing =
    presets.selected !== null &&
    presets.selected !== INHERIT_APPROVAL_TEMPLATE &&
    !presets.templates.some((template) => template.name === presets.selected);
  return [
    {
      key: INHERIT_APPROVAL_TEMPLATE,
      value: INHERIT_APPROVAL_TEMPLATE,
      title: t.autoApprovalFollowGlobal,
      ...(global === undefined ? {} : { detail: global }),
      selected: presets.selected === INHERIT_APPROVAL_TEMPLATE,
    },
    ...presets.templates.map((template) => ({
      key: template.name,
      value: template.name,
      title: templateTitle(template),
      selected: presets.selected === template.name,
    })),
    ...(missing && presets.selected !== null
      ? [
          {
            key: presets.selected,
            value: presets.selected,
            title: t.autoApprovalUnavailable(presets.selected),
            selected: true,
            disabled: true,
          },
        ]
      : []),
    { key: OFF, value: null, title: t.autoApprovalOff, selected: presets.selected === null },
  ];
}
