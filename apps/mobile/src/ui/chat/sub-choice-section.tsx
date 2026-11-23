import { View } from 'react-native';

import {
  modelSub,
  subInherited,
  type ModelSettingsState,
} from '@botharness/host-client/model-settings';
import { type SubChoice } from '@botharness/host-client/preset-sub';
import { matchesPresetSubChoice } from '@botharness/host-protocol/preset-sub';
import type { RoutingGroupEngineOptions } from '@botharness/host-protocol/subscription-engine';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { ModelTargetIcon } from './model-target-icon';
import { SHEET_GROUP } from './sheet';
import { subChoiceKey, subChoiceView } from './sub-choice-text';

export function SubChoiceSection({
  value,
  engines,
  busy,
  onOpen,
  onAdd,
}: {
  value: ModelSettingsState;
  engines?: readonly RoutingGroupEngineOptions[] | undefined;
  busy: boolean;
  onOpen(choice: SubChoice): void;
  onAdd(): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const sub = modelSub(value);
  const tag = (
    <View
      style={{
        backgroundColor: theme.layer[SHEET_GROUP].inset,
        borderRadius: radius.round,
        paddingHorizontal: space.x2,
      }}
    >
      <Text tone="muted" variant="meta">
        {t.routingGroup.defaultTag}
      </Text>
    </View>
  );
  return (
    <SettingsSection
      title={t.subChoices.title}
      footer={subInherited(value) ? t.subChoices.inherited : t.subChoices.hint}
      on={SHEET_GROUP}
    >
      {sub.choices.length === 0 ? (
        <SettingsRow
          on={SHEET_GROUP}
          testID="sub-choice-follows-main"
          title={t.subChoices.followsMain}
          detail={t.subChoices.followsMainHint}
        />
      ) : (
        sub.choices.map((choice) => {
          const view = subChoiceView(value, choice, engines);
          const isDefault = sub.default !== null && matchesPresetSubChoice(choice, sub.default);
          return (
            <SettingsRow
              key={subChoiceKey(choice)}
              on={SHEET_GROUP}
              testID={`sub-choice-${subChoiceKey(choice)}`}
              title={view.title}
              detail={view.detail}
              leading={
                <ModelTargetIcon
                  target={
                    view.external && view.brand !== undefined
                      ? { brand: view.brand, external: true }
                      : { brand: view.brand }
                  }
                  size={theme.type.title.line}
                  color={theme.color.fg}
                />
              }
              {...(isDefault ? { trailing: tag } : {})}
              accessibilityLabel={[
                view.title,
                isDefault ? t.routingGroup.defaultTag : undefined,
                view.detail,
              ]
                .filter(Boolean)
                .join(', ')}
              disclosure
              onPress={busy ? undefined : () => onOpen(choice)}
            />
          );
        })
      )}
      <SettingsRow
        on={SHEET_GROUP}
        testID="sub-choice-add"
        title={t.subChoices.add}
        tone="accent"
        control={{ kind: 'add' }}
        onPress={busy ? undefined : onAdd}
      />
    </SettingsSection>
  );
}
