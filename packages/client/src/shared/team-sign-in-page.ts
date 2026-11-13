export type TeamSignInLanguage = 'en' | 'zh';

export interface TeamSignInPageInput {
  readonly language: TeamSignInLanguage;
  readonly hostName: string;
  readonly nonce: string;
  readonly insecure?: boolean;
}

const COPY = {
  en: {
    title: 'Sign in',
    lead: 'Sign in to {host}',
    username: 'Username',
    password: 'Password',
    submit: 'Sign in',
    busy: 'Signing in…',
    'credentials-invalid': 'Wrong username or password.',
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
    'credentials-invalid': '用户名或密码错误。',
    'rate-limited': '尝试次数太多，{seconds} 秒后再试。',
    'insecure-transport': '此地址不安全，已关闭登录。向 Host 所有者索取 HTTPS 地址。',
    'team-mode-off': '此 Host 暂不接受成员登录。',
    'member-suspended': '你的账号已停用，请联系 Host 所有者。',
    generic: '登录失败，再试一次。',
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

export function renderTeamSignInPage(input: TeamSignInPageInput): string {
  const copy = COPY[input.language];
  const nonce = escapeHtml(input.nonce);
  const host = escapeHtml(input.hostName);
  const lead = escapeHtml(copy.lead).replace('{host}', `<strong>${host}</strong>`);
  const errors: Record<string, string> = {
    'credentials-invalid': copy['credentials-invalid'],
    'rate-limited': copy['rate-limited'],
    'insecure-transport': copy['insecure-transport'],
    'team-mode-off': copy['team-mode-off'],
    'member-suspended': copy['member-suspended'],
    generic: copy.generic,
  };
  const disabled = input.insecure === true ? ' disabled' : '';
  return `<!doctype html>
<html lang="${input.language === 'zh' ? 'zh-CN' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>${escapeHtml(copy.title)} · ${host}</title>
<style nonce="${nonce}">
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
</style>
</head>
<body>
<main>
<h1>${escapeHtml(copy.title)}</h1>
<p class="lead">${lead}</p>
<form id="sign-in" novalidate>
<label>${escapeHtml(copy.username)}<input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required${disabled}></label>
<label>${escapeHtml(copy.password)}<input name="password" type="password" autocomplete="current-password" required${disabled}></label>
<p class="error" id="error" role="alert">${input.insecure === true ? escapeHtml(copy['insecure-transport']) : ''}</p>
<button type="submit"${disabled}>${escapeHtml(copy.submit)}</button>
</form>
</main>
<script nonce="${nonce}">
(() => {
  const errors = ${scriptJson(errors)};
  const labels = ${scriptJson({ submit: copy.submit, busy: copy.busy })};
  const form = document.getElementById('sign-in');
  const error = document.getElementById('error');
  const button = form.querySelector('button');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const username = String(data.get('username') || '').trim().toLowerCase();
    const password = String(data.get('password') || '');
    if (!username || !password) return;
    button.disabled = true;
    button.textContent = labels.busy;
    error.textContent = '';
    try {
      const response = await fetch('sign-in', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (response.ok) { location.reload(); return; }
      const body = await response.json().catch(() => ({}));
      const code = typeof body.code === 'string' && errors[body.code] ? body.code : 'generic';
      const seconds = Number(body.retryAfterSeconds);
      error.textContent = errors[code].replace('{seconds}', Number.isFinite(seconds) ? String(Math.ceil(seconds)) : '60');
      form.password.value = '';
      form.password.focus();
    } catch {
      error.textContent = errors.generic;
    }
    button.disabled = false;
    button.textContent = labels.submit;
  });
})();
</script>
</body>
</html>
`;
}
