import { describe, expect, it } from 'vitest';
import { zhTranslate } from '../src/client/locale.js';
import {
  REMOTE_SETTINGS_SECTIONS,
  remoteSettingsRows,
} from '../src/client/remote-settings-rows.js';

describe('remoteSettingsRows', () => {
  it('shows a Team member only the sections that are theirs on a remote Host', () => {
    expect(remoteSettingsRows(zhTranslate, { member: true }).map((row) => row.id)).toEqual([
      REMOTE_SETTINGS_SECTIONS.hostAppearance,
      REMOTE_SETTINGS_SECTIONS.hostNotifications,
      REMOTE_SETTINGS_SECTIONS.hostConnections,
    ]);
  });
  it('keeps every section for a Host this owner paired', () => {
    expect(remoteSettingsRows(zhTranslate).map((row) => row.id)).toContain(
      REMOTE_SETTINGS_SECTIONS.hostApprovals,
    );
  });
});
