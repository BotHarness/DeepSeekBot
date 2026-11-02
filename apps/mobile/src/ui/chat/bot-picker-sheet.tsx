import type { ReactElement, RefCallback } from 'react';
import { FlatList, View } from 'react-native';
import { DrawerHeader } from '../primitives/drawer-header';
import { ParticipantChoice } from '../primitives/participant-choice';
import { useStrings } from '../strings';
import { Sheet, SheetCallout } from './sheet';

export interface BotPickerCandidate {
  slug: string;
  displayName: string;
}

export interface BotPickerSheetProps<T extends BotPickerCandidate> {
  title: string;
  candidates: readonly T[];
  selected: ReadonlySet<string>;
  busy: boolean;
  error?: string | undefined;
  mount?: RefCallback<unknown> | undefined;
  canConfirm: boolean;
  onToggle(slug: string): void;
  onConfirm(): void | Promise<void>;
  onClose(): void;
  renderLeading?(bot: T): ReactElement;
}

export function BotPickerSheet<T extends BotPickerCandidate>(props: BotPickerSheetProps<T>) {
  const t = useStrings();
  return (
    <View ref={props.mount}>
      <Sheet visible label={props.title} onClose={props.onClose}>
        <DrawerHeader
          title={props.title}
          onClose={props.onClose}
          {...(props.canConfirm ? { onConfirm: () => void props.onConfirm() } : {})}
          confirmLabel={t.done}
        />
        {props.error === undefined ? null : (
          <SheetCallout tone="danger">{props.error}</SheetCallout>
        )}
        <FlatList
          data={props.candidates}
          extraData={[props.selected, props.busy]}
          keyExtractor={(bot) => bot.slug}
          renderItem={({ item }) => (
            <ParticipantChoice
              id={item.slug}
              label={item.displayName}
              checked={props.selected.has(item.slug)}
              disabled={props.busy}
              onChange={() => props.onToggle(item.slug)}
            />
          )}
        />
      </Sheet>
    </View>
  );
}
