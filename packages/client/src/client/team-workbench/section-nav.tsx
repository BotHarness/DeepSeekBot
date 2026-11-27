import type { ReactElement } from 'react';

import { Icon } from '../ds/icon.js';
import { NavGroupHeading, NavItem } from '../ds/nav-item.js';
import { Tooltip } from '../ds/tooltip.js';
import type { BotHarnessTranslate } from '../locale.js';
import {
  TEAM_SECTION_GROUPS,
  type TeamSection,
  type TeamSectionContext,
  type TeamSectionId,
} from './sections.js';

export function SectionNav({
  t,
  sections,
  context,
  current,
  compact,
  onSelect,
}: {
  t: BotHarnessTranslate;
  sections: readonly TeamSection[];
  context: TeamSectionContext;
  current: TeamSectionId | undefined;
  compact: boolean;
  onSelect(id: TeamSectionId): void;
}): ReactElement {
  const groups = TEAM_SECTION_GROUPS.map((group) => ({
    group,
    items: sections.filter((section) => section.group === group.id),
  })).filter(({ items }) => items.length > 0);
  return (
    <>
      {groups.map(({ group, items }, index) => (
        <div key={group.id} role="group" aria-label={t(group.label)}>
          {compact ? null : <NavGroupHeading first={index === 0} label={t(group.label)} />}
          {items.map((section) => {
            const label = t(section.label);
            const count = section.count(context);
            const item = (
              <NavItem
                icon={<Icon name={section.icon} />}
                label={label}
                aria-label={compact ? label : undefined}
                iconOnly={compact}
                current={section.id === current}
                trailing={compact || count === undefined ? undefined : String(count)}
                data={{ 'data-team-nav': section.id }}
                onSelect={() => onSelect(section.id)}
              />
            );
            return (
              <Tooltip key={section.id} label={label} side="right" disabled={!compact}>
                {item}
              </Tooltip>
            );
          })}
        </div>
      ))}
    </>
  );
}
