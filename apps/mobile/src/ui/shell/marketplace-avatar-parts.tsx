import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { View } from 'react-native';
import type { CatalogueResource } from '../../marketplace/catalogue';
import { useCatalogueResource } from '../../marketplace/native-catalogue';
import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Button } from '../primitives/button';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';

export function useAvatarResource<T>(resource: CatalogueResource<T>) {
  useFocusEffect(
    useCallback(() => {
      void resource.refresh();
    }, [resource]),
  );
  return useCatalogueResource(resource);
}

export function AvatarLoadState({
  error,
  loading,
  onRetry,
}: {
  error?: string | undefined;
  loading?: boolean;
  onRetry(): void;
}) {
  const t = useStrings();
  const copy = t.marketplaceAvatars;
  if (loading) return <LoadingIndicator accessibilityLabel={copy.loading} />;
  if (!error) return null;
  return (
    <View style={{ gap: space.x3 }}>
      <Text accessibilityRole="alert" tone="danger">
        {avatarFailureMessage(error, copy)}
      </Text>
      <Button label={t.retry} testID="marketplace-avatar-retry" onPress={onRetry} />
    </View>
  );
}

export function avatarFailureMessage(
  error: string,
  copy: ReturnType<typeof useStrings>['marketplaceAvatars'],
) {
  if (error === 'not-found' || error === 'avatar-not-found') return copy.missing;
  if (error === 'sign-in-required' || error === 'sign-in-rejected') return copy.hostSignIn;
  if (error === 'permission-required') return copy.permission;
  if (error === 'bot-not-found') return copy.botUnavailable;
  if (error === 'no-stored-avatar') return copy.noStoredAvatar;
  if (error === 'unprocessed-image') return copy.imageError;
  if (error === 'already-reported') return copy.reported;
  return copy.unavailable;
}

export function MarketplaceAvatarImage({
  uri,
  rounded = true,
}: {
  uri: string;
  rounded?: boolean;
}) {
  const theme = useDesignTheme();
  return (
    <Image
      source={uri}
      accessibilityIgnoresInvertColors
      contentFit="cover"
      style={{
        width: '100%',
        aspectRatio: 1,
        ...(rounded ? { borderRadius: radius.lg } : {}),
        backgroundColor: theme.layer.canvas.inset,
      }}
    />
  );
}
