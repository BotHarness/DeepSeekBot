import type { ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BotHarnessTranslate } from './locale.js';

export function ConnectionGuide({
  t,
  method,
}: {
  t: BotHarnessTranslate;
  method: 'named' | 'ingress' | 'relay' | 'tailscale';
}): ReactElement {
  const urls = {
    named: t('connections.privateGuideUrl'),
    ingress: t('connections.ingressGuideUrl'),
    relay: t('connections.relayGuideUrl'),
    tailscale: 'https://tailscale.com/docs/reference/faq/other-vpns',
  };
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.open(urls[method], '_blank', 'noopener,noreferrer')}
    >
      {t(method === 'tailscale' ? 'connections.vpnGuide' : 'connections.deploymentGuide')}
    </Button>
  );
}
