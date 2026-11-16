import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { SystemSymbol } from '../primitives/system-symbol';
import type { SkillOption } from './skill-draft';

export function skillOwnerName(option: SkillOption, host: string): string {
  if (option.owner.kind === 'host') return host;
  if (option.owner.kind === 'workspace') return option.owner.name;
  return option.bot?.displayName ?? option.owner.botSlug;
}

export function SkillOwnerMark({ option, size }: { option: SkillOption; size: number }) {
  const theme = useDesignTheme();
  if (option.owner.kind === 'bot' && option.bot !== undefined)
    return <BotAvatar bot={option.bot} size={size} ring={false} />;
  return (
    <SystemSymbol
      name={
        option.owner.kind === 'workspace'
          ? { ios: 'folder', android: 'folder' }
          : { ios: 'desktopcomputer', android: 'computer' }
      }
      size={size}
      color={theme.color.muted}
    />
  );
}
