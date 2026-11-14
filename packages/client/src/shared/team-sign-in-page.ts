export type TeamSignInLanguage = 'en' | 'zh';

export type TeamSignInStep = 'sign-in' | 'change-password';

export interface TeamSignInPageInput {
  readonly language: TeamSignInLanguage;
  readonly hostName: string;
  readonly nonce: string;
  readonly insecure?: boolean;
  readonly step?: TeamSignInStep;
  readonly displayName?: string;
}

export const TEAM_PAGE_PASSWORD_MIN_LENGTH = 10;

const COPY = {
  en: {
    title: 'Sign in',
    lead: 'Sign in to {host}',
    username: 'Username',
    password: 'Password',
    submit: 'Sign in',
    busy: 'Signing in…',
    changeTitle: 'Choose a new password',
    changeLead: 'Hi {name}. Replace the one-time password to continue to {host}.',
    oneTime: 'One-time password',
    newPassword: 'New password',
    confirm: 'Confirm new password',
    rule: 'At least {min} characters.',
    changeSubmit: 'Continue',
    changeBusy: 'Saving…',
    mismatch: 'Passwords do not match.',
    same: 'Choose a password different from the one-time password.',
    'credentials-invalid': 'Wrong username or password.',
    'one-time-invalid': 'The one-time password is wrong.',
    'password-weak': 'Use at least {min} characters.',
    'password-reused': 'Choose a password you have not used here.',
    'rate-limited': 'Too many attempts. Try again in {seconds} s.',
    'insecure-transport':
      'This address is not secure, so sign-in is off. Ask the Host owner for the HTTPS address.',
    'team-mode-off': 'This Host does not accept member sign-in right now.',
    'member-suspended': 'Your account is suspended. Ask the Host owner.',
    generic: 'Could not sign in. Try again.',
  },
  zh: {
    title: '登录',
    lead: '登录到 {host}',
    username: '用户名',
    password: '密码',
    submit: '登录',
    busy: '正在登录…',
    changeTitle: '设置新密码',
    changeLead: '{name}，你好。替换一次性密码后即可进入 {host}。',
    oneTime: '一次性密码',
    newPassword: '新密码',
    confirm: '确认新密码',
    rule: '至少 {min} 个字符。',
    changeSubmit: '继续',
    changeBusy: '正在保存…',
    mismatch: '两次输入的密码不一致。',
    same: '新密码不能与一次性密码相同。',
    'credentials-invalid': '用户名或密码错误。',
    'one-time-invalid': '一次性密码错误。',
    'password-weak': '至少使用 {min} 个字符。',
    'password-reused': '换一个在这里没用过的密码。',
    'rate-limited': '尝试次数太多，{seconds} 秒后再试。',
    'insecure-transport': '此地址不安全，已关闭登录。向 Host 所有者索取 HTTPS 地址。',
    'team-mode-off': '此 Host 暂不接受成员登录。',
    'member-suspended': '你的账号已停用，请联系 Host 所有者。',
    generic: '出错了，再试一次。',
  },
} as const;

type CopyKey = keyof (typeof COPY)['en'];

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll(' ', '\\u2028')
    .replaceAll(' ', '\\u2029');
}

export function teamSignInCopy(language: TeamSignInLanguage, key: CopyKey): string {
  return COPY[language][key];
}

const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #f5f5f7; --card: #ffffff; --fg: #1d1d1f; --muted: #6e6e73;
  --edge: rgba(0, 0, 0, 0.12); --accent: #1d1d1f; --on-accent: #ffffff;
  --danger: #c4302b; --focus: rgba(0, 113, 227, 0.5);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111113; --card: #1c1c1f; --fg: #f5f5f7; --muted: #a1a1a6;
    --edge: rgba(255, 255, 255, 0.14); --accent: #f5f5f7; --on-accent: #111113;
    --danger: #ff6961; --focus: rgba(64, 156, 255, 0.6);
  }
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0; display: grid; place-items: center; padding: 16px;
  background: var(--bg); color: var(--fg);
  font: 14px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}
main {
  width: min(360px, 100%); padding: 32px 24px 24px; border-radius: 16px;
  background: var(--card); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06), 0 8px 32px rgba(0, 0, 0, 0.08);
}
h1 { margin: 0 0 4px; font-size: 20px; line-height: 28px; font-weight: 600; }
p.lead { margin: 0 0 24px; color: var(--muted); overflow-wrap: anywhere; }
p.lead strong { color: var(--fg); font-weight: 500; }
form { display: flex; flex-direction: column; gap: 16px; margin: 0; }
label { display: flex; flex-direction: column; gap: 6px; font-weight: 500; }
small { color: var(--muted); font-size: 12px; line-height: 16px; font-weight: 400; }
input {
  height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--edge);
  background: transparent; color: inherit; font: inherit;
}
input:focus-visible, button:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
button {
  height: 40px; margin-top: 8px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--accent); color: var(--on-accent); font: inherit; font-weight: 500;
}
button:disabled { opacity: 0.5; cursor: default; }
p.error { margin: 0; min-height: 20px; color: var(--danger); }
p.error:empty { display: none; }
`;

const SIGN_IN_SCRIPT = `
  const form = document.getElementById('team-form');
  const error = document.getElementById('error');
  const button = form.querySelector('button');
  const show = (body) => {
    const code = typeof body.code === 'string' && copy[body.code] ? body.code : 'generic';
    const seconds = Number(body.retryAfterSeconds);
    error.textContent = copy[code].replace('{seconds}', Number.isFinite(seconds) ? String(Math.ceil(seconds)) : '60');
  };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const username = String(data.get('username') || '').trim().toLowerCase();
    const password = String(data.get('password') || '');
    if (!username || !password) return;
    button.disabled = true;
    button.textContent = copy.busy;
    error.textContent = '';
    try {
      const response = await fetch('sign-in', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (response.ok) { location.reload(); return; }
      show(await response.json().catch(() => ({})));
      form.password.value = '';
      form.password.focus();
    } catch {
      error.textContent = copy.generic;
    }
    button.disabled = false;
    button.textContent = copy.submit;
  });
`;

const CHANGE_SCRIPT = `
  const form = document.getElementById('team-form');
  const error = document.getElementById('error');
  const button = form.querySelector('button');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const current = form.current.value;
    const next = form.next.value;
    if (!current) return;
    if (next.length < min) { error.textContent = copy['password-weak']; return; }
    if (next !== form.confirm.value) { error.textContent = copy.mismatch; return; }
    if (next === current) { error.textContent = copy.same; return; }
    button.disabled = true;
    button.textContent = copy.changeBusy;
    error.textContent = '';
    try {
      const response = await fetch('password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ current, next }),
      });
      if (response.ok) { location.reload(); return; }
      const body = await response.json().catch(() => ({}));
      const code = body.code === 'credentials-invalid' ? 'one-time-invalid' : body.code;
      const seconds = Number(body.retryAfterSeconds);
      error.textContent = (typeof code === 'string' && copy[code] ? copy[code] : copy.generic)
        .replace('{seconds}', Number.isFinite(seconds) ? String(Math.ceil(seconds)) : '60');
    } catch {
      error.textContent = copy.generic;
    }
    button.disabled = false;
    button.textContent = copy.changeSubmit;
  });
`;

export function renderTeamSignInPage(input: TeamSignInPageInput): string {
  const copy = COPY[input.language];
  const nonce = escapeHtml(input.nonce);
  const host = escapeHtml(input.hostName);
  const min = String(TEAM_PAGE_PASSWORD_MIN_LENGTH);
  const change = input.step === 'change-password';
  const title = change ? copy.changeTitle : copy.title;
  const lead = change
    ? escapeHtml(copy.changeLead)
        .replace('{name}', escapeHtml(input.displayName ?? ''))
        .replace('{host}', `<strong>${host}</strong>`)
    : escapeHtml(copy.lead).replace('{host}', `<strong>${host}</strong>`);
  const disabled = input.insecure === true ? ' disabled' : '';
  const initialError = input.insecure === true ? escapeHtml(copy['insecure-transport']) : '';
  const fields = change
    ? `<label>${escapeHtml(copy.oneTime)}<input name="current" type="password" autocomplete="current-password" required${disabled}></label>
<label>${escapeHtml(copy.newPassword)}<input name="next" type="password" autocomplete="new-password" minlength="${min}" required${disabled}><small>${escapeHtml(copy.rule.replace('{min}', min))}</small></label>
<label>${escapeHtml(copy.confirm)}<input name="confirm" type="password" autocomplete="new-password" required${disabled}></label>`
    : `<label>${escapeHtml(copy.username)}<input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required${disabled}></label>
<label>${escapeHtml(copy.password)}<input name="password" type="password" autocomplete="current-password" required${disabled}></label>`;
  const scriptCopy = Object.fromEntries(
    Object.entries(copy).map(([key, value]) => [key, value.replace('{min}', min)]),
  );
  return `<!doctype html>
<html lang="${input.language === 'zh' ? 'zh-CN' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · ${host}</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p class="lead">${lead}</p>
<form id="team-form" data-step="${change ? 'change-password' : 'sign-in'}" novalidate>
${fields}
<p class="error" id="error" role="alert">${initialError}</p>
<button type="submit"${disabled}>${escapeHtml(change ? copy.changeSubmit : copy.submit)}</button>
</form>
</main>
<script nonce="${nonce}">
(() => {
  const copy = ${scriptJson(scriptCopy)};
  const min = ${min};
${change ? CHANGE_SCRIPT : SIGN_IN_SCRIPT}
})();
</script>
</body>
</html>
`;
}
