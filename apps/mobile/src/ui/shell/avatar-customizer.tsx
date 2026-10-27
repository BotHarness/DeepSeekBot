import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { AVATAR_LABELS } from '../../../../../packages/core/src/bots/avatar-labels';
import {
  avatarSvg,
  seededAvatarFor,
  type AvatarFamily,
  type AvatarRecipe,
} from '../../../../../packages/core/src/bots/avatar-appearance';
import {
  DEFAULT_LINE_RECIPE,
  seededLineRecipe,
} from '../../../../../packages/core/src/bots/avatar-line';
import {
  avatarCategories,
  avatarColorCanFollowHair,
  avatarColorSwatches,
  avatarFamilyOptions,
  avatarFeatureHidden,
  avatarField,
  avatarOptions,
  changeAvatarFeature,
  type AvatarOption,
} from '../../host/avatar-customization';
import { randomAvatarSeed } from '../../host/bot-avatar-choice';
import { useDesignTheme } from '../design/theme';
import { avatarEditor, edge, radius, space } from '../design/tokens';
import { AvatarRange } from '../primitives/avatar-range';
import { Button } from '../primitives/button';
import { Chip } from '../primitives/chip';
import { Segmented } from '../primitives/segmented';
import { SheetSaveButton } from '../primitives/sheet-save-button';
import { Text } from '../primitives/text';
import { locale, useStrings } from '../strings';
import { CheckIcon } from './icons';

const labels = {
  en: new Map(Object.entries(AVATAR_LABELS.en)),
  zh: new Map(Object.entries(AVATAR_LABELS.zh)),
};
const label = (key: string) => labels[locale].get(`profile.avatar.${key}`) ?? key;

const Portrait = memo(function Portrait({ recipe, size }: { recipe: AvatarRecipe; size: number }) {
  const uri = useMemo(() => `data:image/svg+xml;base64,${btoa(avatarSvg(recipe))}`, [recipe]);
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size }}
      cachePolicy="memory"
      contentFit="contain"
    />
  );
});

const OptionTile = memo(function OptionTile({
  option,
  selected,
  category,
  onChoose,
}: {
  option: AvatarOption;
  selected: boolean;
  category: string;
  onChoose(recipe: AvatarRecipe): void;
}) {
  const theme = useDesignTheme();
  const title =
    category === 'presets'
      ? `${label('presets')} ${option.value}`
      : label(
          `${option.recipe.family === 'line' ? 'line' : 'option'}.${category === 'rightSideHair' ? 'sideHair' : category}.${option.value}`,
        );
  return (
    <Pressable
      testID={`avatar-option-${option.id}`}
      accessibilityRole="radio"
      accessibilityLabel={title}
      accessibilityState={{ checked: selected }}
      onPress={() => onChoose(option.recipe)}
      android_ripple={{ color: theme.layer.raised.pressed }}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: theme.touch,
        alignItems: 'center',
        padding: space.x2,
        gap: space.x2,
        borderRadius: radius.lg,
        borderWidth: edge.hairline,
        borderColor: selected ? theme.color.accent : theme.color.borderField,
        backgroundColor: pressed
          ? theme.layer.raised.pressed
          : selected
            ? theme.layer.raised.chosen
            : theme.layer.raised.fill,
      })}
    >
      <Portrait recipe={option.recipe} size={avatarEditor.tile} />
      <Text variant="meta" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      <View style={{ height: theme.type.meta.line }}>
        {selected ? <CheckIcon color={theme.color.accent} size={theme.type.meta.line} /> : null}
      </View>
    </Pressable>
  );
});

type EditorRow =
  | { kind: 'option'; option: AvatarOption }
  | { kind: 'color'; field: string }
  | { kind: 'range'; field: string; min: number; max: number };

export function AvatarCustomizer({
  initial,
  onSave,
  onClose,
}: {
  initial: AvatarRecipe;
  onSave(recipe: AvatarRecipe): Promise<boolean>;
  onClose(): void;
}) {
  const strings = useStrings();
  const theme = useDesignTheme();
  const [recipe, setRecipe] = useState(initial);
  const [drafts, setDrafts] = useState<Record<AvatarFamily, AvatarRecipe>>(() => ({
    illustrated:
      initial.family === 'illustrated' ? initial : seededAvatarFor(randomAvatarSeed(), 2),
    line: initial.family === 'line' ? initial : DEFAULT_LINE_RECIPE,
  }));
  const [category, setCategory] = useState(initial.family === 'line' ? 'eyes' : 'hair');
  const [base, setBase] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const family = recipe.family;
  const chooseCategory = (next: string) => {
    setBase(recipe);
    setCategory(next);
  };
  const chooseFamily = (next: AvatarFamily) => {
    setDrafts((current) => ({ ...current, [family]: recipe }));
    setRecipe(drafts[next]);
    setBase(drafts[next]);
    setCategory(next === 'line' ? 'eyes' : 'hair');
  };
  const choices = useMemo(() => avatarOptions(base, category), [base, category]);
  const spec = avatarFamilyOptions[family];
  const rows: EditorRow[] =
    category === 'colors'
      ? spec.colors.map((field) => ({ kind: 'color', field }))
      : category === 'shape'
        ? Object.entries(spec.ranges).map(([field, [min, max]]) => ({
            kind: 'range',
            field,
            min,
            max,
          }))
        : choices.map((option) => ({ kind: 'option', option }));
  const columns =
    category === 'colors' || category === 'shape'
      ? 1
      : theme.largeText
        ? avatarEditor.largeColumns
        : avatarEditor.columns;
  const change = (field: string, value: string | number) => {
    const next = changeAvatarFeature(recipe, field, value);
    if (next) setRecipe(next);
  };
  const shuffle = () => {
    const seed = randomAvatarSeed();
    const next = family === 'line' ? seededLineRecipe(seed) : seededAvatarFor(seed, 2);
    setRecipe(next);
    setBase(next);
    if (!avatarCategories(next).includes(category))
      setCategory(next.family === 'line' ? 'eyes' : 'hair');
  };
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    let saved = false;
    try {
      saved = await onSave(recipe);
    } catch {
      saved = false;
    }
    setBusy(false);
    setFailed(!saved);
    if (saved) onClose();
  };
  return (
    <View testID="avatar-customizer" style={{ flex: 1, backgroundColor: theme.color.base }}>
      <Stack.Screen
        options={{
          title: strings.avatarEditor.title,
          headerRight: () => (
            <SheetSaveButton
              testID="avatar-editor-save"
              label={strings.done}
              busy={busy}
              disabled={false}
              onPress={() => void save()}
            />
          ),
        }}
      />
      <View pointerEvents={busy ? 'none' : 'auto'} style={{ flex: 1 }}>
        <View style={{ alignItems: 'center', gap: space.x3, padding: space.x4 }}>
          <View
            accessibilityRole="image"
            accessibilityLabel={strings.avatarEditor.preview}
            testID="avatar-editor-preview"
            style={{ borderRadius: radius.round, overflow: 'hidden' }}
          >
            <Portrait recipe={recipe} size={avatarEditor.preview} />
          </View>
          <View style={{ alignSelf: 'stretch' }}>
            <Segmented<AvatarFamily>
              label={label('family')}
              value={family}
              onChange={chooseFamily}
              options={[
                { value: 'illustrated', label: label('family.illustrated') },
                { value: 'line', label: label('family.line') },
              ]}
            />
          </View>
        </View>
        <View
          style={{
            flexDirection: theme.largeText ? 'column' : 'row',
            alignItems: theme.largeText ? 'stretch' : 'center',
            gap: space.x2,
            paddingHorizontal: space.x4,
          }}
        >
          <FlatList
            testID="avatar-editor-categories"
            style={{ flex: theme.largeText ? undefined : 1 }}
            horizontal
            data={avatarCategories(recipe)}
            keyExtractor={(value) => value}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space.x2 }}
            renderItem={({ item }) => (
              <Chip
                testID={`avatar-category-${item}`}
                label={label(item)}
                selected={category === item}
                onPress={() => chooseCategory(item)}
              />
            )}
          />
          <Button
            testID="avatar-editor-shuffle"
            label={strings.botCreation.shuffleAvatar}
            symbol="refresh"
            variant="text"
            onPress={shuffle}
          />
        </View>
        {failed ? (
          <Text tone="danger" style={{ padding: space.x4 }}>
            {strings.avatarEditor.saveFailed}
          </Text>
        ) : null}
        {avatarFeatureHidden(recipe, category) ? (
          <Text tone="muted" style={{ padding: space.x4 }}>
            {label('hiddenNote')}
          </Text>
        ) : null}
        <FlatList<EditorRow>
          testID="avatar-editor-options"
          key={`${family}-${category}-${columns}`}
          data={rows}
          numColumns={columns}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={3}
          keyExtractor={(row) => (row.kind === 'option' ? row.option.id : row.field)}
          contentContainerStyle={{ padding: space.x4, gap: space.x3, paddingBottom: space.x6 }}
          columnWrapperStyle={columns > 1 ? { gap: space.x3 } : undefined}
          renderItem={({ item }) =>
            item.kind === 'option' ? (
              <OptionTile
                option={item.option}
                category={category}
                selected={
                  category === 'presets'
                    ? JSON.stringify(recipe) === JSON.stringify(item.option.recipe)
                    : (avatarField(recipe, category) ?? 'none') === item.option.value
                }
                onChoose={setRecipe}
              />
            ) : item.kind === 'range' ? (
              <View style={{ gap: space.x2 }}>
                <Text>{`${label(item.field)}  ${avatarField(recipe, item.field) ?? 0}`}</Text>
                <AvatarRange
                  label={label(item.field)}
                  min={item.min}
                  max={item.max}
                  value={Number(avatarField(recipe, item.field) ?? 0)}
                  onChange={(value) => change(item.field, value)}
                />
              </View>
            ) : (
              <View style={{ gap: space.x2 }}>
                <Text strong>{label(item.field)}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x2 }}>
                  {avatarColorSwatches(recipe, item.field).map((color) => (
                    <Pressable
                      key={color}
                      testID={`avatar-color-${item.field}-${color.slice(1)}`}
                      accessibilityRole="radio"
                      accessibilityLabel={`${label(item.field)} ${color}`}
                      accessibilityState={{ checked: avatarField(recipe, item.field) === color }}
                      onPress={() => change(item.field, color)}
                      android_ripple={{ color: theme.layer.raised.pressed }}
                      style={{
                        minWidth: theme.touch,
                        minHeight: theme.touch,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: radius.round,
                        borderWidth: edge.hairline,
                        borderColor:
                          avatarField(recipe, item.field) === color
                            ? theme.color.accent
                            : theme.color.borderField,
                      }}
                    >
                      <View
                        style={{
                          width: avatarEditor.color,
                          height: avatarEditor.color,
                          borderRadius: radius.round,
                          backgroundColor: color,
                        }}
                      />
                      {avatarField(recipe, item.field) === color ? (
                        <View
                          pointerEvents="none"
                          style={{
                            position: 'absolute',
                            right: 0,
                            bottom: 0,
                            backgroundColor: theme.color.accent,
                            borderRadius: radius.round,
                          }}
                        >
                          <CheckIcon color={theme.color.onAccent} size={theme.type.meta.line} />
                        </View>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
                {avatarColorCanFollowHair(recipe, item.field) ? (
                  <Button
                    variant="text"
                    label={label('followHairColor')}
                    testID={`avatar-color-reset-${item.field}`}
                    onPress={() => change(item.field, 'none')}
                  />
                ) : null}
              </View>
            )
          }
        />
      </View>
    </View>
  );
}
