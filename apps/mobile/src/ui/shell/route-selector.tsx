import { useState } from 'react';

import { useHostSession } from '../../host/host-session';
import { SHEET_GROUP } from '../chat/sheet';
import { Segmented } from '../primitives/segmented';
import { SettingsFormItem } from '../primitives/settings-form';
import { Notice } from '../request-parts';
import { useStrings } from '../strings';

export type RouteKind = 'connect' | 'tailscale' | 'lan';

export function classifyRoute(url: string): RouteKind {
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (
      host.endsWith('.ts.net') ||
      /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/u.test(host)
    )
      return 'tailscale';
    if (isLanHost(host) && u.protocol === 'http:' && u.port !== '') return 'lan';
    return 'connect';
  } catch {
    return 'connect';
  }
}

function isLanHost(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/u.test(p) || Number(p) > 255))
    return false;
  const [a, b] = parts.map(Number);
  if (a === undefined || b === undefined) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function RouteSelector() {
  const { saved, client } = useHostSession();
  const t = useStrings();
  const snapshot = client?.getSnapshot();
  const currentPreference = snapshot?.routePreference ?? saved?.routePreference;
  const routes = saved?.routes ?? [];
  const currentRoute = snapshot?.connection?.route ?? routes[0] ?? '';
  const currentKind = currentPreference
    ? classifyRoute(currentPreference)
    : classifyRoute(currentRoute);

  const [failed, setFailed] = useState(false);
  const handleChange = (kind: RouteKind) => {
    const target = routes.find((r) => classifyRoute(r) === kind) ?? routes[0];
    const setter = client?.setRoutePreference;
    if (target === undefined || setter === undefined) return;
    void setter(target).then(
      () => setFailed(false),
      () => setFailed(true),
    );
  };

  if (routes.length <= 1) return null;

  return (
    <SettingsFormItem>
      <>
        <Segmented
        label={t.routeSelector.title}
        options={[
          { value: 'connect' as RouteKind, label: t.routeSelector.connect },
          { value: 'tailscale' as RouteKind, label: t.routeSelector.tailscale },
          { value: 'lan' as RouteKind, label: t.routeSelector.lan },
        ]}
        value={currentKind}
        onChange={handleChange}
        />
        {failed ? <Notice tone="danger">{t.routeSelector.failed}</Notice> : null}
        {client?.secretInputAllowed?.() === false ? null : (
          <Notice tone="warning">{t.routeSelector.hint}</Notice>
        )}
      </>
    </SettingsFormItem>
  );
}
