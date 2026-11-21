import { randomUUID } from 'expo-crypto';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MAX_MARKETPLACE_AVATAR_DESCRIPTION,
  MAX_MARKETPLACE_AVATAR_NAME,
  parseMarketplaceAvatarText,
  type MarketplaceAvatar,
  type MarketplaceAvatarText,
} from '@botharness/host-protocol/marketplace-avatar';
import { useHostSession } from '../../host/host-session';
import {
  MarketplaceAvatarTooSmall,
  pickMarketplaceAvatarImage,
  prepareMarketplaceAvatarImage,
} from '../../host/pick-avatar-image';
import { marketplaceAvatars, type MarketplaceAvatars } from '../../marketplace/avatars';
import { space } from '../design/tokens';
import { useMounted } from '../mounted';
import { showAppDialog } from '../primitives/app-dialog';
import { Button } from '../primitives/button';
import { CreationField } from '../primitives/creation-field';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { SettingsRow } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { useAvatarAction } from './marketplace-avatar-action';
import {
  AvatarLoadState,
  MarketplaceAvatarImage,
  useAvatarResource,
} from './marketplace-avatar-parts';

export function MarketplaceAvatarEditorScreen() {
  const { id, bot, hostId } = useLocalSearchParams<{
    id?: string;
    bot?: string;
    hostId?: string;
  }>();
  const { client, saved } = useHostSession(hostId);
  const copy = useStrings().marketplaceAvatars;
  const insets = useSafeAreaInsets();
  return (
    <>
      <Stack.Screen options={{ title: id ? copy.edit : copy.publish }} />
      <KeyboardFormScroll
        contentContainerStyle={{
          padding: space.x5,
          paddingBottom: insets.bottom + space.x5,
          gap: space.x4,
        }}
      >
        {hostId && client && saved && saved.member === undefined ? (
          id ? (
            <EditAvatar key={`${hostId}:${id}`} actions={marketplaceAvatars(client)} id={id} />
          ) : (
            <PublishAvatar
              key={`${hostId}:${bot ?? ''}`}
              actions={marketplaceAvatars(client)}
              hostId={hostId}
              bot={bot}
            />
          )
        ) : (
          <Text>{copy.unavailable}</Text>
        )}
      </KeyboardFormScroll>
    </>
  );
}

function EditAvatar({ actions, id }: { actions: MarketplaceAvatars; id: string }) {
  const copy = useStrings().marketplaceAvatars;
  const state = useAvatarResource(actions.mine);
  const avatar = state.value?.find((item) => item.id === id);
  if (avatar) return <AvatarEditor key={id} actions={actions} mode={{ kind: 'edit', avatar }} />;
  return (
    <AvatarLoadState
      error={state.error ?? (state.value ? 'not-found' : undefined)}
      loading={!state.value && !state.error}
      onRetry={() => void actions.mine.refresh()}
    />
  );
}

function PublishAvatar({
  actions,
  bot,
  hostId,
}: {
  actions: MarketplaceAvatars;
  bot: string | undefined;
  hostId: string;
}) {
  const t = useStrings();
  const copy = t.marketplaceAvatars;
  const state = useAvatarResource(actions.account);
  const account = state.value;
  const refresh = () => void actions.account.refresh();
  if (!account || state.error) {
    return <AvatarLoadState error={state.error} loading={!state.error} onRetry={refresh} />;
  }
  if (!account.signedIn) {
    return (
      <View style={{ gap: space.x4 }}>
        <Text>{copy.hostSignIn}</Text>
        <Button label={t.marketplace.retry} onPress={refresh} />
      </View>
    );
  }
  if (account.author?.termsAcceptedAt == null) {
    return <MarketplaceAuthorForm actions={actions} initialName={account.author?.name ?? ''} />;
  }
  return (
    <AvatarEditor
      key={account.author.id}
      actions={actions}
      mode={{ kind: 'publish', hostId, bot, author: account.author }}
    />
  );
}

function MarketplaceAuthorForm({
  actions,
  initialName,
}: {
  actions: MarketplaceAvatars;
  initialName: string;
}) {
  const t = useStrings();
  const copy = t.marketplaceAvatars;
  const [name, setName] = useState(initialName);
  const [terms, setTerms] = useState(false);
  const action = useAvatarAction();
  return (
    <View style={{ gap: space.x4 }}>
      <CreationField
        accessibilityLabel={copy.authorName}
        testID="marketplace-avatar-author"
        value={name}
        editable={!action.busy}
        onChangeText={setName}
      />
      <SettingsRow
        title={copy.terms}
        control={{
          kind: 'switch',
          value: terms,
          onChange: setTerms,
          disabled: action.busy,
          testID: 'marketplace-avatar-accept-terms',
        }}
      />
      {action.error ? (
        <Text tone="danger" accessibilityRole="alert">
          {action.error}
        </Text>
      ) : null}
      <Button
        label={t.done}
        tone="primary"
        testID="marketplace-avatar-save-author"
        disabled={!terms || !name.trim()}
        busy={action.busy}
        onPress={() =>
          void action.run(
            async () => {
              await actions.saveAuthor(name.trim());
              await actions.account.refresh();
            },
            () => t.dialogFailed,
          )
        }
      />
    </View>
  );
}

type EditorMode =
  | { kind: 'edit'; avatar: MarketplaceAvatar }
  | {
      kind: 'publish';
      hostId: string;
      bot: string | undefined;
      author: { id: string; name: string };
    };

function AvatarEditor({ actions, mode }: { actions: MarketplaceAvatars; mode: EditorMode }) {
  const t = useStrings();
  const copy = t.marketplaceAvatars;
  const existing = mode.kind === 'edit' ? mode.avatar : undefined;
  const bot = mode.kind === 'publish' ? mode.bot : undefined;
  const [image, setImage] = useState(existing?.imageUrl);
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [tags, setTags] = useState(existing?.tags.join(', ') ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [requestKey] = useState(randomUUID);
  const mounted = useRef(false);
  const mount = useMounted<ViewInstance>(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const action = useAvatarAction();
  const prepare = () =>
    void action.run(
      async () => {
        const prepared =
          bot === undefined
            ? await pickMarketplaceAvatarImage()
            : await prepareMarketplaceAvatarImage((await actions.source(bot)).image);
        if (prepared) setImage(prepared);
      },
      (error) => (error instanceof MarketplaceAvatarTooSmall ? copy.tooSmall : copy.imageError),
    );
  const text = parseMarketplaceAvatarText({
    name,
    description,
    tags: tags.trim() ? tags.split(/[,，]/u) : [],
  });
  const submit = (draft: MarketplaceAvatarText, media: string) => {
    if (mode.kind === 'edit') {
      void action.run(
        async () => {
          await actions.edit(mode.avatar.id, draft);
          await actions.mine.refresh();
          if (mounted.current) router.back();
        },
        () => t.dialogFailed,
      );
      return;
    }
    Keyboard.dismiss();
    showAppDialog(copy.publish, copy.publishWarning, [
      { text: t.cancel, style: 'cancel' },
      {
        text: copy.publish,
        onPress: () =>
          action.run(
            async () => {
              setSubmitted(true);
              const avatar = await actions.publish({
                ...draft,
                image: media,
                requestKey,
                confirm: true,
                expectedAuthorId: mode.author.id,
              });
              if (mounted.current)
                router.replace({
                  pathname: '/marketplace-avatar',
                  params: { id: avatar.id, hostId: mode.hostId },
                });
            },
            () => t.dialogFailed,
          ),
      },
    ]);
  };
  return (
    <View ref={mount} style={{ gap: space.x4 }}>
      {mode.kind === 'publish' ? (
        <Text>{copy.publishAs(mode.author.name, mode.author.id)}</Text>
      ) : null}
      {image ? <MarketplaceAvatarImage uri={image} /> : null}
      {mode.kind === 'publish' ? (
        <Button
          label={bot === undefined ? copy.photos : copy.loadBotImage}
          testID="marketplace-avatar-choose-image"
          busy={action.busy}
          disabled={submitted || (!!image && bot !== undefined)}
          onPress={prepare}
        />
      ) : null}
      <CreationField
        accessibilityLabel={copy.name}
        testID="marketplace-avatar-name"
        value={name}
        onChangeText={setName}
        editable={!action.busy && !submitted}
        maxLength={MAX_MARKETPLACE_AVATAR_NAME * 2}
      />
      <CreationField
        accessibilityLabel={copy.description}
        testID="marketplace-avatar-description"
        value={description}
        onChangeText={setDescription}
        editable={!action.busy && !submitted}
        multiline
        maxLength={MAX_MARKETPLACE_AVATAR_DESCRIPTION * 2}
      />
      <CreationField
        accessibilityLabel={copy.tagField}
        testID="marketplace-avatar-tag-input"
        value={tags}
        onChangeText={setTags}
        editable={!action.busy && !submitted}
        supportingText={copy.tagHint}
      />
      {!text && name.trim() ? <Text tone="muted">{copy.invalidText}</Text> : null}
      {action.error ? (
        <Text tone="danger" accessibilityRole="alert">
          {action.error}
        </Text>
      ) : null}
      <Button
        label={mode.kind === 'edit' ? t.done : copy.publish}
        testID="marketplace-avatar-save"
        tone="primary"
        disabled={!text || !image}
        busy={action.busy}
        onPress={() => {
          if (text && image) submit(text, image);
        }}
      />
    </View>
  );
}
