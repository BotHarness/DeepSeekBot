import { PlusMenuButton, type PlusMenuItem } from '../primitives/plus-menu-button';
import { useStrings } from '../strings';
import { creationMenuItems, type CreationMenuItem } from './creation-menu-items';
import type { CreationMenuButtonProps } from './creation-menu-button';
const symbols = {
  bot: 'person',
  zip: 'doc.zipper',
  marketplace: 'globe',
  git: 'point.3.connected.trianglepath.dotted',
  channel: 'bubble.left.and.bubble.right',
  invite: 'person.badge.plus',
  join: 'person.2',
} as const;
export function CreationMenuButton(props: CreationMenuButtonProps) {
  const t = useStrings();
  const convert = (item: CreationMenuItem): PlusMenuItem => ({
    id: `creation-${item.key}`,
    label: item.label,
    symbol: symbols[item.action],
    run: () => props.onPick(item.action, item.target),
    ...(item.children ? { children: item.children.map(convert) } : {}),
  });
  return (
    <PlusMenuButton
      label={t.createHere}
      testID="creation-menu-trigger"
      size={props.size}
      disabled={props.busy}
      items={creationMenuItems(props).map(convert)}
    />
  );
}
