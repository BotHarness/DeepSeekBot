declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'botharness.settings.layout': { kind: 'list'; scope: 'root'; owner: Record<string, never> };
    'botharness.settings.section': {
      kind: 'list';
      scope: 'root';
      owner: BotSettingsSectionOwnerProps;
    };
  }
}

export interface BotSettingsSectionOwnerProps {
  close(): void;
  pairPhone?: boolean | undefined;
  clientOnly?: boolean;
}

type SettingsSlotProps<Slot extends 'botharness.settings.section' | 'botharness.settings.layout'> =
  import('@deepseek-ai/dsh-client-ui-slots').PropsRenderSlots<Slot>;

export type SettingsSectionSlots = SettingsSlotProps<'botharness.settings.section'>;
export type SettingsLayoutSlots = SettingsSlotProps<'botharness.settings.layout'>;
