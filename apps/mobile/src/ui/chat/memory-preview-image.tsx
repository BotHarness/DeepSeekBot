import { use, useState } from 'react';
import { Pressable, useWindowDimensions, View, type ViewInstance } from 'react-native';
import { Image } from 'expo-image';

import type { HostClient } from '../../host/client';
import type { MessageAttachment } from '../../host/conversation';
import {
  imageReferenceKind,
  loadPreviewImage,
  memoryPreviewSource,
  type MemoryPreviewIO,
  type PreviewImage,
} from '../../host/memory-preview';
import type { MemoryImage, MemoryMarkdown } from '../../host/wire';
import { shareAttachment } from '../../host/share-attachment';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { ImageViewer } from './image-viewer';
import { MemoryVisibility } from './memory-visibility';
import { LoadingIndicator } from '../primitives/loading-indicator';

export function MemoryPreviewImage({
  client,
  io,
  slug,
  path,
  version,
  reference,
  alt = path,
  onRefresh,
}: {
  client: HostClient;
  io: MemoryPreviewIO;
  slug: string;
  path: string;
  version: MemoryImage | MemoryMarkdown;
  reference?: string;
  alt?: string;
  onRefresh?: (() => void) | undefined;
}) {
  const theme = useDesignTheme();
  const frame = useWindowDimensions();
  const stage = use(MemoryVisibility);
  const kind = reference === undefined ? 'local' : imageReferenceKind(reference);
  const [allowed, setAllowed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [image, setImage] = useState<PreviewImage>();
  const [failure, setFailure] = useState<string>();
  const [decoded, setDecoded] = useState(false);
  const [viewer, setViewer] = useState<MessageAttachment>();
  const enabled =
    version.status === 'ready' && kind !== 'invalid' && (kind !== 'remote' || allowed);
  const mount = useMounted<ViewInstance>(
    (node) => {
      setImage(undefined);
      setFailure(undefined);
      setDecoded(false);
      setViewer(undefined);
      if (!enabled) return;
      let active = true;
      let loaded: PreviewImage | undefined;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const load = async () => {
        timer = setTimeout(() => controller.abort(), 30_000);
        try {
          loaded = await loadPreviewImage(
            io,
            memoryPreviewSource(client, slug, path, version, reference),
            controller.signal,
          );
          if (!active) {
            loaded.dispose();
            return;
          }
          setImage(loaded);
        } catch (error) {
          if (active)
            setFailure(error instanceof Error ? error.message : 'memory-image-load-failed');
        } finally {
          clearTimeout(timer);
        }
      };
      const stop = stage?.observe(node, () => void load());
      if (!stage) void load();
      return () => {
        active = false;
        controller.abort();
        clearTimeout(timer);
        stop?.();
        loaded?.dispose();
      };
    },
    [client, io, slug, path, version.source, version.revision, enabled, reference, stage, attempt],
  );
  const attachment: MessageAttachment | undefined =
    image === undefined
      ? undefined
      : {
          key: image.uri,
          name:
            reference?.split('/').at(-1)?.split(/[?#]/u)[0] ||
            path.split('/').at(-1) ||
            'image.png',
          kind: 'image',
          mime: image.mime,
          size: image.size,
          local: true,
          source: { uri: image.uri, headers: {} },
        };
  const share = async (value: MessageAttachment) => {
    try {
      await shareAttachment(value);
    } catch {
      setFailure('memory-image-share-failed');
    }
  };
  const error =
    kind === 'invalid'
      ? 'memory-image-invalid'
      : version.status !== 'ready'
        ? `memory-image-${version.status}`
        : failure;
  return (
    <View
      ref={mount}
      collapsable={false}
      onLayout={() => stage?.notify()}
      style={{ gap: space.x3, minHeight: theme.touch, paddingVertical: space.x3 }}
    >
      {alt ? (
        <Text variant="meta" tone="muted" selectable>
          {alt}
        </Text>
      ) : null}
      {kind === 'remote' && !allowed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.memoryLoadExternal}
          onPress={() => setAllowed(true)}
          style={{ minHeight: theme.touch, justifyContent: 'center' }}
        >
          <Text tone="accent">{t.memoryLoadExternal}</Text>
          <Text variant="meta" tone="muted" selectable>
            {reference}
          </Text>
        </Pressable>
      ) : error ? (
        <View style={{ gap: space.x2 }}>
          <Text selectable tone="muted">
            {t.memoryImageError(error)}
          </Text>
          {enabled ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.tryAgain}
              onPress={() => {
                if (error === 'memory-image-stale' && onRefresh) onRefresh();
                else setAttempt(attempt + 1);
              }}
              style={{ minHeight: theme.touch, justifyContent: 'center' }}
            >
              <Text tone="accent">{t.tryAgain}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <>
          {!decoded ? <LoadingIndicator accessibilityLabel={t.memoryImageLoading} /> : null}
          {image && attachment ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.memoryEnlarge(alt)}
                onPress={() => setViewer(attachment)}
              >
                <Image
                  source={{ uri: image.uri }}
                  cachePolicy="none"
                  recyclingKey={image.uri}
                  contentFit="contain"
                  accessibilityLabel={alt}
                  onLoad={() => setDecoded(true)}
                  onError={() => setFailure('memory-image-unsupported')}
                  style={{
                    width: '100%',
                    aspectRatio: image.width / image.height,
                    maxHeight: frame.height * 0.6,
                    borderRadius: radius.sm,
                  }}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.shareFile(attachment.name)}
                onPress={() => void share(attachment)}
                style={{ minHeight: theme.touch, justifyContent: 'center' }}
              >
                <Text tone="accent">{t.shareFile(attachment.name)}</Text>
              </Pressable>
            </>
          ) : null}
        </>
      )}
      <ImageViewer
        cachePolicy="none"
        attachment={viewer}
        onClose={() => setViewer(undefined)}
        onShare={share}
      />
    </View>
  );
}
