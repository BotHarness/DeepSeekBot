import { useCallback } from 'react';
import { Linking, View } from 'react-native';
import type { MarketplaceDetail as Detail } from '../../../../../packages/core/src/marketplace/client';
import { MarketplaceArt } from './marketplace-art';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { MarkdownView } from '../markdown-view';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { marketplaceReadmeLink } from '../../marketplace/readme-links';

export function MarketplaceDetail({
  detail,
  busy,
  disabled,
  onImport,
}: {
  detail: Detail;
  busy: boolean;
  disabled: boolean;
  onImport(): void;
}) {
  const bot = detail.bot;
  const theme = useDesignTheme();
  const openLink = useCallback(
    (href: string) => {
      const url = marketplaceReadmeLink(href, {
        repositoryUrl: bot.htmlUrl,
        commit: detail.commitSha,
      });
      if (url) void Linking.openURL(url).catch(() => undefined);
    },
    [bot.htmlUrl, detail.commitSha],
  );
  return (
    <View style={{ gap: space.x5 }}>
      <View
        style={{
          borderRadius: radius.lg,
          overflow: 'hidden',
          backgroundColor: theme.layer.raised.fill,
        }}
      >
        <MarketplaceArt bot={bot} profile />
        <View style={{ padding: space.x5, gap: space.x4 }}>
          <Text variant="title" strong selectable>
            {bot.displayName ?? bot.name}
          </Text>
          <Text tone="muted" selectable>
            {bot.fullName}
          </Text>
          {bot.description ? <Text selectable>{bot.description}</Text> : null}
          {bot.descriptionGenerated ? (
            <Text variant="meta" tone="muted">
              {t.marketplace.generated}
            </Text>
          ) : null}
          {bot.roles.length > 0 ? <Text selectable>{bot.roles.join(' · ')}</Text> : null}
          {bot.topics.length > 0 ? (
            <Text tone="muted" selectable>
              {bot.topics.join(' · ')}
            </Text>
          ) : null}
          <Text tone="muted">{t.marketplace.stars(bot.stars)}</Text>
          <Text selectable tone="muted">
            {t.marketplace.revision(detail.commitSha?.slice(0, 12) ?? t.marketplace.noRevision)}
          </Text>
          <Button
            testID="marketplace-import"
            label={t.marketplace.import}
            tone="primary"
            busy={busy}
            disabled={disabled}
            onPress={onImport}
          />
        </View>
      </View>
      {!detail.commitSha ? <Text>{t.marketplace.refreshRevision}</Text> : null}
      {detail.readme ? (
        <MarkdownView source={detail.readme} onOpenLink={openLink} />
      ) : (
        <Text tone="muted">{t.marketplace.noReadme}</Text>
      )}
    </View>
  );
}
