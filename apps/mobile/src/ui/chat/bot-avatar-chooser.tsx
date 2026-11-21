import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Pressable, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MethodRefused } from '@botharness/host-client/client';
import { TILTIES_PORTRAITS } from '@botharness/host-client/tilties-avatars';
import {
  avatarSvg,
  type AvatarRecipe,
} from '../../../../../packages/core/src/bots/avatar-appearance';
import { avatarFamilyOptions } from '../../host/avatar-customization';
import { setBotAvatar, setBotAvatarRecipe } from '../../host/bot-avatar';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { pickAvatarImage } from '../../host/pick-avatar-image';
import { marketplaceAvatarsAvailable } from '../../marketplace/available';
import { useDesignTheme } from '../design/theme';
import { avatarEditor, radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { Segmented } from '../primitives/segmented';
import { Text } from '../primitives/text';
import { useMounted } from '../mounted';
import { useStrings } from '../strings';
import { useAvatarEditor, type AvatarActions } from './avatar-editor';
import { useProfileFocused } from './profile-visibility';

type Gallery = 'illustrated' | 'line' | 'tilties';
type Portrait =
  | { id: string; kind: 'image'; image: string; en: string; zh: string }
  | { id: string; kind: 'recipe'; recipe: AvatarRecipe; number: number };

const tilties: Portrait[] = TILTIES_PORTRAITS.map((portrait) => ({
  ...portrait,
  kind: 'image',
}));
function presetPortraits(recipes: readonly AvatarRecipe[]): Portrait[] {
  return recipes.map((recipe, index) => ({
    id: String(index + 1),
    kind: 'recipe',
    recipe,
    number: index + 1,
  }));
}

const galleries: Record<Gallery, Portrait[]> = {
  illustrated: presetPortraits(avatarFamilyOptions.illustrated.presets),
  line: presetPortraits(avatarFamilyOptions.line.presets),
  tilties,
};

export function BotAvatarChooserScreen() {
  const { slug, hostId } = useLocalSearchParams<{ slug: string; hostId?: string }>();
  const { saved, client } = useHostSession(hostId);
  const focused = useProfileFocused();
  const snapshot = useHostSnapshot(client, focused);
  const bot = snapshot.roster?.bots.find((entry) => entry.slug === slug);
  const loading =
    client &&
    snapshot.roster === undefined &&
    snapshot.connection.status !== 'refused' &&
    snapshot.connection.status !== 'unreachable';
  const router = useRouter();
  const t = useStrings();
  return (
    <>
      <Stack.Screen options={{ title: t.avatarChange }} />
      {hostId &&
      saved?.hostId === hostId &&
      client &&
      bot &&
      snapshot.connection.status !== 'refused' ? (
        <BotAvatarChooser
          key={hostId + ':' + slug}
          actions={{
            pick: pickAvatarImage,
            save: (avatar) => setBotAvatar(client, bot, avatar),
            saveRecipe: (recipe) => setBotAvatarRecipe(client, bot, recipe),
          }}
          onClose={() => router.back()}
          onMarketplace={
            marketplaceAvatarsAvailable
              ? () =>
                  router.push({
                    pathname: '/marketplace-avatars',
                    params: { hostId, targetBot: slug },
                  })
              : undefined
          }
        />
      ) : (
        <View style={{ padding: space.x5 }}>
          {loading ? (
            <LoadingIndicator />
          ) : (
            <Text>{snapshot.connection.status === 'refused' ? t.refused : t.noBot}</Text>
          )}
        </View>
      )}
    </>
  );
}

export function BotAvatarChooser({
  actions,
  onClose,
  onMarketplace,
}: {
  actions: AvatarActions;
  onClose(): void;
  onMarketplace?: (() => void) | undefined;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const editor = useAvatarEditor(actions, (failure) =>
    failure instanceof MethodRefused && failure.code === 'permission-required'
      ? t.marketplaceAvatars.permission
      : t.avatarEditor.saveFailed,
  );
  const [gallery, setGallery] = useState<Gallery>('illustrated');
  const active = useRef(false);
  const mount = useMounted<ViewInstance>(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const choose = async (portrait?: Portrait) => {
    const saved =
      portrait?.kind === 'recipe'
        ? await editor.chooseRecipe?.(portrait.recipe)
        : await editor.choose(portrait?.image);
    if (saved && active.current) onClose();
  };
  const retry = async () => {
    if ((await editor.retry?.()) && active.current) onClose();
  };
  const columns = theme.largeText ? avatarEditor.largeColumns : avatarEditor.columns;

  return (
    <View ref={mount} style={{ flex: 1 }}>
      <FlatList
        key={gallery + ':' + columns}
        data={galleries[gallery]}
        keyExtractor={(item) => item.id}
        numColumns={columns}
        contentContainerStyle={{
          padding: space.x5,
          paddingBottom: insets.bottom + space.x5,
          gap: space.x3,
        }}
        columnWrapperStyle={{ gap: space.x3 }}
        ListHeaderComponent={
          <View style={{ gap: space.x3 }}>
            <Button
              testID="bot-avatar-pick-photo"
              label={t.avatarEditor.photos}
              disabled={editor.busy}
              onPress={() => void choose()}
            />
            {onMarketplace ? (
              <Button
                testID="bot-avatar-open-marketplace"
                label={t.marketplaceAvatars.choose}
                disabled={editor.busy}
                onPress={onMarketplace}
              />
            ) : null}
            {editor.error ? (
              <>
                <Text accessibilityLiveRegion="polite" accessibilityRole="alert" tone="danger">
                  {editor.error}
                </Text>
                {editor.retry ? (
                  <Button
                    label={t.retry}
                    testID="bot-avatar-retry"
                    disabled={editor.busy}
                    onPress={() => void retry()}
                  />
                ) : null}
              </>
            ) : null}
            <Segmented<Gallery>
              label={t.avatarEditor.style}
              options={[
                { value: 'illustrated', label: t.avatarEditor.pixel },
                { value: 'line', label: t.avatarEditor.line },
                { value: 'tilties', label: t.avatarEditor.tilties },
              ]}
              value={gallery}
              disabled={editor.busy}
              onChange={setGallery}
            />
          </View>
        }
        renderItem={({ item }) => {
          const label =
            item.kind === 'image'
              ? t.avatarEditor.tiltiesName(item.en, item.zh)
              : t.avatarEditor.preset(item.number);
          const uri =
            item.kind === 'image'
              ? item.image
              : 'data:image/svg+xml;base64,' + btoa(avatarSvg(item.recipe));
          return (
            <Pressable
              testID={
                item.kind === 'image' ? 'tilties-avatar-' + item.id : gallery + '-avatar-' + item.id
              }
              accessibilityRole="button"
              accessibilityLabel={label}
              disabled={editor.busy}
              onPress={() => void choose(item)}
              style={({ pressed }) => ({
                flexBasis: avatarEditor.tile,
                minHeight: Math.max(avatarEditor.tile, theme.touch),
                flexGrow: 1,
                maxWidth: 100 / columns + '%',
                aspectRatio: 1,
                borderRadius: radius.md,
                overflow: 'hidden',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Image source={{ uri }} contentFit="contain" style={{ flex: 1 }} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}
