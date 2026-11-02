import type { ComputerTranslate } from './locale.js';

export function localSetupFailure(code: string | undefined, t: ComputerTranslate): string {
  switch (code) {
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
    default:
      return t('local.error.setup');
  }
}
