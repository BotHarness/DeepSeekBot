import { Redirect } from 'expo-router';
import { marketplaceAvatarsAvailable } from '../src/marketplace/available';
import { MarketplaceAvatarDetailScreen } from '../src/ui/shell/marketplace-avatar-detail-screen';

export default function MarketplaceAvatarDetailScreenRoute() {
  return marketplaceAvatarsAvailable ? (
    <MarketplaceAvatarDetailScreen />
  ) : (
    <Redirect href="/marketplace" />
  );
}
