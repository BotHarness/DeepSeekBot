import type { BotAvatarChoice } from '../../host/bot-creation';

export interface CreationHeaderProps {
  title: string;
  name: string;
  avatar: BotAvatarChoice | undefined;
  imported: boolean;
  step: { index: number; total: number };
  progress: number | undefined;
  onClose(): void;
}
