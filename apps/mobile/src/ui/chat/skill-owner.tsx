import { useContext } from 'react';

import { hostColorInk } from '@botharness/host-client/ui/design/host-look';
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { SystemSymbol } from '../primitives/system-symbol';
import { HostGlyph } from '../shell/host-tile';
import { MessageIdentities } from './message-identities';
import type { SkillOption } from './skill-draft';

export function skillOwnerName(option: SkillOption, host: string): string {
  if (option.owner.kind === 'host') return host;
  if (option.owner.kind === 'workspace') return option.owner.name;
  return option.bot?.displayName ?? option.owner.botSlug;
}

export function SkillOwnerMark({ option, size }: { option: SkillOption; size: number }) {
  const theme = useDesignTheme();
  const { host } = useContext(MessageIdentities);
  if (option.owner.kind === 'bot' && option.bot !== undefined)
    return <BotAvatar bot={option.bot} size={size} ring={false} />;
  if (option.owner.kind === 'host' && host !== undefined)
    return (
      <HostGlyph
        icon={host.look.icon}
        size={size}
        color={hostColorInk(theme.scheme, theme.color, host.look.color)}
      />
    );
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
