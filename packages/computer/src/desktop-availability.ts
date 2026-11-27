export const waylandIssues = {
  'desktop-consent-pending':
    'On this computer, select the screen in the GNOME sharing dialog, enable Allow Remote Interaction and Remember This Selection, then choose Share.',
  'desktop-consent-required':
    'Check the desktop again. In the GNOME sharing dialog, select the screen, enable Allow Remote Interaction and Remember This Selection, then choose Share.',
  'desktop-locked': 'The desktop is locked. Unlock it on this computer.',
  'desktop-screen-inactive':
    'GNOME has blanked or locked the screen. Wake or unlock it on this computer.',
  'desktop-restoring':
    'Reconnecting to this desktop. If GNOME asks to share it again, confirm on this computer.',
  'desktop-portal-ended':
    'GNOME stopped sharing this desktop. Check the desktop again on this computer.',
  'desktop-portal-dependencies':
    'Install the GNOME desktop portal and the Python GObject and GStreamer components for PipeWire screen sharing, then check the desktop again.',
  'desktop-portal-token-write':
    'Could not save GNOME desktop permission. Check the Host profile folder permissions, then check the desktop again.',
  'desktop-unreachable':
    'Start the Host from a terminal in the signed-in GNOME Wayland desktop and check again.',
} as const;

export type WaylandIssueCode = keyof typeof waylandIssues;
export type DesktopAccessIssue = { readonly code: WaylandIssueCode; readonly detail: string };

export function waylandIssue(value: unknown): DesktopAccessIssue | undefined {
  for (const code of Object.keys(waylandIssues) as WaylandIssueCode[]) {
    if (value === code) return { code, detail: waylandIssues[code] };
  }
}

export function isWaylandDesktop(environment: NodeJS.ProcessEnv = process.env): boolean {
  return (
    (environment['XDG_SESSION_TYPE'] === 'wayland' || !!environment['WAYLAND_DISPLAY']) &&
    (environment['XDG_CURRENT_DESKTOP'] ?? '').split(':').includes('GNOME')
  );
}
