import type { ComputerTranslate } from './locale.js';

export function localSetupFailure(code: string | undefined, t: ComputerTranslate): string {
  switch (code) {
    case 'desktop-consent-pending':
      return t('local.wayland.consentPending');
    case 'desktop-consent-required':
      return t('local.wayland.consentRequired');
    case 'desktop-locked':
      return t('local.wayland.locked');
    case 'desktop-screen-inactive':
      return t('local.wayland.inactive');
    case 'desktop-restoring':
      return t('local.wayland.restoring');
    case 'desktop-portal-ended':
      return t('local.wayland.ended');
    case 'desktop-portal-dependencies':
      return t('local.wayland.dependencies');
    case 'desktop-portal-token-write':
      return t('local.wayland.token');
    case 'x11-session-required':
      return t('local.error.x11');
    case 'desktop-unreachable':
      return t('local.error.desktop');
    case 'linux-desktop-required':
      return t('local.error.linux');
    case 'permissions-required':
      return t('local.error.permissions');
    case 'disk-full':
      return t('local.error.disk');
    case 'runtime-write-refused':
      return t('local.error.write');
    case 'download-failed':
      return t('local.error.download');
    case 'verification-failed':
      return t('local.error.verify');
    case 'installation-failed':
      return t('local.error.install');
    case 'settings-open-failed':
      return t('local.error.settings');
    case 'target-changed':
      return t('local.error.target');
    case 'request-failed':
      return t('local.error.request');
    case undefined:
    default:
      return t('local.error.setup');
  }
}
