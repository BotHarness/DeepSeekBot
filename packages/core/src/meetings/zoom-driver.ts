import { untilPage, type MeetingPageDriver, type MeetingPageState } from './browser-far-end.js';

const ZOOM_HOST = /(^|\.)zoom\.(us|com)$/u;
const ZOOM_MEETING_PATH = /^\/(?:j|wc\/join|wc)\/(\d{9,12})(?:\/|$)/u;

export function zoomMeetingNumber(url: URL): string | undefined {
  if (url.protocol !== 'https:' || !ZOOM_HOST.test(url.hostname)) return undefined;
  return ZOOM_MEETING_PATH.exec(url.pathname)?.[1];
}

export function zoomWebClientUrl(url: URL): string {
  const meeting = zoomMeetingNumber(url);
  if (meeting === undefined) throw new Error('not a Zoom meeting link');
  const target = new URL(`https://app.zoom.us/wc/join/${meeting}`);
  const pwd = url.searchParams.get('pwd');
  if (pwd !== null) target.searchParams.set('pwd', pwd);
  return target.toString();
}

const IN_ZOOM = `(() => {
  const frame = document.querySelector('iframe#webclient');
  const doc = (frame && frame.contentDocument) || document;
  const text = (doc.body && doc.body.innerText || '').toLowerCase();
  const buttons = [...doc.querySelectorAll('button')];
  const button = (...labels) => buttons.find((item) => {
    const label = ((item.getAttribute('aria-label') || '') + ' ' + item.innerText).toLowerCase();
    return labels.some((wanted) => label.includes(wanted));
  });
  return { doc, text, button };
})()`;

const DENIED =
  'automated bots|meeting link is invalid|invalid meeting id|passcode is wrong|removed you|removed from the meeting|not allowed to join';

const ENTER = (name: string) => `(() => {
  const { doc, text, button } = ${IN_ZOOM};
  if (/${DENIED}/.test(text)) return true;
  const input = doc.querySelector('#input-for-name, input[aria-label*="name" i]');
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(name)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const join = button('join');
  if (!join || join.disabled) return false;
  join.click();
  return true;
})()`;

const READ = `(() => {
  const { doc, text, button } = ${IN_ZOOM};
  if (/${DENIED}/.test(text))
    return { phase: 'denied' };
  if (/meeting has been ended|this meeting has ended|the meeting has ended/.test(text))
    return { phase: 'ended' };
  const leave = doc.querySelector('.footer__leave-btn') || button('leave');
  if (!leave) {
    if (/let you in soon|waiting room|waiting for the host|host has joined/.test(text))
      return { phase: 'lobby' };
    return { phase: 'joining' };
  }
  const audio = button('join audio by computer', 'join with computer audio');
  if (audio) audio.click();
  const counter = doc.querySelector('.footer-button__number-counter');
  const people = counter ? Number(counter.innerText.replace(/[^0-9]/g, '')) : NaN;
  const active = doc.querySelector(
    '.speaker-active-container__video-frame .video-avatar__avatar-footer, ' +
    '.speaker-bar-container__video-frame--active .video-avatar__avatar-footer, ' +
    '.gallery-video-container__video-frame--active .video-avatar__avatar-footer',
  );
  return {
    phase: 'in-meeting',
    participants: Number.isFinite(people) && people > 0 ? people : undefined,
    speaker: active ? active.innerText.trim() || undefined : undefined,
  };
})()`;

const LEAVE = `(() => {
  const { doc, button } = ${IN_ZOOM};
  const leave = doc.querySelector('.footer__leave-btn') || button('leave');
  if (leave) leave.click();
  return true;
})()`;

const CONFIRM_LEAVE = `(() => {
  const { button } = ${IN_ZOOM};
  const confirm = button('leave meeting');
  if (!confirm) return false;
  confirm.click();
  return true;
})()`;

export const zoomDriver: MeetingPageDriver = {
  platform: 'zoom',
  matches: (url) => zoomMeetingNumber(url) !== undefined,
  pageUrl: zoomWebClientUrl,
  async enter(page, displayName, signal) {
    await untilPage(page, ENTER(displayName), {
      timeoutMs: 45_000,
      signal,
      what: 'Zoom join form',
    });
    if ((await page.evaluate<MeetingPageState>(READ)).phase === 'denied')
      throw new Error('Zoom refused this meeting link');
  },
  read: (page) => page.evaluate<MeetingPageState>(READ),
  async leave(page) {
    await page.evaluate(LEAVE);
    await untilPage(page, CONFIRM_LEAVE, {
      timeoutMs: 3_000,
      signal: new AbortController().signal,
      what: 'Zoom leave',
    }).catch(() => undefined);
  },
};
