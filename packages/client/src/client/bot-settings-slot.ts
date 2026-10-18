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
}
