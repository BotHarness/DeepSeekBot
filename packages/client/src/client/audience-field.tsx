import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Checkbox } from '@deepseek-ai/dsh-client-ui-primitives';

import { Select } from './ds/select.js';
import { space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { audienceOptions } from './team-spaces-view.js';
import type { AudienceDirectory, SpaceAudience } from './team-spaces-bridge.js';

const styles = stylex.create({
  checks: { display: 'flex', flexDirection: 'column', gap: space.x2, minWidth: 0 },
});

export function emptyAudience(kind: SpaceAudience['kind']): SpaceAudience {
  if (kind === 'roles') return { kind: 'roles', roleIds: [] };
  if (kind === 'members') return { kind: 'members', humanIds: [] };
  return { kind: 'everyone' };
}

export function toggleAudience(audience: SpaceAudience, id: string, on: boolean): SpaceAudience {
  if (audience.kind === 'everyone') return audience;
  const current = audience.kind === 'roles' ? audience.roleIds : audience.humanIds;
  const next = new Set(current);
  if (on) next.add(id);
  else next.delete(id);
  return audience.kind === 'roles'
    ? { kind: 'roles', roleIds: [...next] }
    : { kind: 'members', humanIds: [...next] };
}

export function AudienceField({
  t,
  label,
  audience,
  stored,
  directory,
  disabled,
  onChange,
}: {
  t: BotHarnessTranslate;
  label: string;
  audience: SpaceAudience;
  stored: SpaceAudience | undefined;
  directory: AudienceDirectory;
  disabled: boolean;
  onChange(next: SpaceAudience): void;
}): ReactElement {
  const chosen =
    audience.kind === 'roles'
      ? audience.roleIds
      : audience.kind === 'members'
        ? audience.humanIds
        : [];
  const options = audienceOptions(t, audience, stored, directory);
  return (
    <>
      <Select
        label={label}
        value={audience.kind}
        disabled={disabled}
        options={[
          { value: 'everyone', label: t('team.spaces.audienceEveryone') },
          { value: 'roles', label: t('team.spaces.audienceRoles') },
          { value: 'members', label: t('team.spaces.audienceMembers') },
        ]}
        onChange={(kind) => onChange(emptyAudience(kind as SpaceAudience['kind']))}
      />
      {options.length === 0 ? null : (
        <div {...stylex.props(styles.checks)}>
          {options.map((option) => (
            <div key={option.id} data-audience-option={option.id}>
              <Checkbox
                label={option.label}
                checked={chosen.includes(option.id)}
                disabled={disabled}
                onChange={(checked) => onChange(toggleAudience(audience, option.id, checked))}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
