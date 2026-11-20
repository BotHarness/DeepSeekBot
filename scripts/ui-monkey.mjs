import { mulberry32 } from './seeded-random.mjs';

export const UNSAFE =
  /\b(?:delete|remove|reset|clear|erase|uninstall|install|disconnect|revoke|sign out|log ?out|quit|stop|restart|shut ?down|send|submit|report|publish|share|purchase|buy|pay)\b|删除|移除|重置|清空|清除|卸载|安装|断开|撤销|退出|停止|重启|发送|提交|反馈|报告|发布|分享|购买|支付/iu;

export const KEYS = ['Escape', 'Tab', 'Shift+Tab', 'ArrowDown', 'ArrowUp', 'Space'];

export const TEXTS = [
  'hello',
  '你好，世界',
  '',
  '   ',
  '@',
  '/',
  'x'.repeat(400),
  '<b>bold</b> **md** `code`',
  '😀👍🏽👨‍👩‍👧',
  '‮right-to-left',
  '-1',
  '1e309',
];

export const safeTargets = (targets) =>
  targets.filter((target) => !target.external && !UNSAFE.test(target.name));

const pick = (random, list) => list[Math.floor(random() * list.length)];

const ACTIVATION = new Set(['Space']);

export function pickAction(random, targets, focused) {
  const safe = safeTargets(targets);
  const keys =
    focused && safeTargets([focused]).length === 0
      ? KEYS.filter((key) => !ACTIVATION.has(key))
      : KEYS;
  const fields = safe.filter((target) => target.editable);
  const clickable = safe.filter((target) => !target.editable);
  const roll = random();
  if (fields.length > 0 && roll < 0.2)
    return { kind: 'type', target: pick(random, fields), text: pick(random, TEXTS) };
  if (roll < 0.3 || clickable.length === 0) return { kind: 'press', key: pick(random, keys) };
  return { kind: 'click', target: pick(random, clickable) };
}

export const describeAction = (action) =>
  action.kind === 'press'
    ? `press ${action.key}`
    : `${action.kind} ${action.target.role} ${JSON.stringify(action.target.name)}${
        action.kind === 'type' ? ` <- ${JSON.stringify(action.text.slice(0, 40))}` : ''
      }`;

function collectTargets() {
  const selector = [
    'button',
    'a[href]',
    'summary',
    'textarea',
    'input:not([type="hidden"]):not([type="file"])',
    '[contenteditable="true"]',
    ...[
      'button',
      'tab',
      'menuitem',
      'menuitemradio',
      'menuitemcheckbox',
      'option',
      'switch',
      'checkbox',
      'radio',
    ].map((role) => `[role="${role}"]`),
  ].join(', ');
  const text =
    'textarea, [contenteditable="true"], input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="number"]';
  const nodes = [...document.querySelectorAll(selector)].filter((node) => {
    const box = node.getBoundingClientRect();
    return (
      box.width > 0 &&
      box.height > 0 &&
      box.bottom > 0 &&
      box.right > 0 &&
      box.top < innerHeight &&
      box.left < innerWidth &&
      getComputedStyle(node).visibility !== 'hidden' &&
      node.closest('[disabled], [aria-disabled="true"], [inert]') === null
    );
  });
  window.__bhMonkey = nodes;
  const describe = (node, index) => ({
    index,
    role: node.getAttribute('role') ?? node.tagName.toLowerCase(),
    name: (
      node.getAttribute('aria-label') ||
      node.textContent ||
      node.getAttribute('placeholder') ||
      node.getAttribute('title') ||
      ''
    )
      .trim()
      .replace(/\s+/gu, ' ')
      .slice(0, 80),
    editable: node.matches(text),
    external:
      node.tagName === 'A' &&
      (node.target === '_blank' || new URL(node.href, location.href).origin !== location.origin),
  });
  const active = document.activeElement;
  return {
    targets: nodes.map(describe),
    focused: active && active !== document.body ? describe(active, -1) : undefined,
  };
}

const STALLED = Symbol('stalled');

const settle = (ms) => new Promise((done) => setTimeout(done, ms));

async function within(ms, work) {
  let timer;
  try {
    return await Promise.race([
      work,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function perform(page, action) {
  if (action.kind === 'press') {
    const keys = action.key.split('+');
    const key = keys.pop();
    for (const modifier of keys) await page.keyboard.down(modifier);
    await page.keyboard.press(key);
    for (const modifier of keys.reverse()) await page.keyboard.up(modifier);
    return;
  }
  const handle = await page.evaluateHandle(
    (index) => window.__bhMonkey?.[index],
    action.target.index,
  );
  const element = handle.asElement();
  if (element === null) throw new Error('target left the page');
  await element.click();
  if (action.kind === 'type') {
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    if (action.text) await page.keyboard.type(action.text, { delay: 0 });
  }
}

const shellAlive = (page) =>
  page.evaluate(
    () =>
      document.body !== null &&
      document.body.innerText.trim().length > 0 &&
      document.querySelector('button') !== null,
  );

export const STALL_MS = 10_000;

export async function runMonkey(
  page,
  { seed, steps, origin, pause = 250, setupErrors = [], stallMs = STALL_MS },
) {
  const random = mulberry32(seed);
  const actions = [];
  const pageErrors = setupErrors.map((message) => ({ step: 0, message }));
  const consoleErrors = [];
  let step = 0;
  let blankAt;
  let stalledAt;
  const onPageError = (error) => pageErrors.push({ step, message: error.message });
  const onConsole = (message) => {
    if (message.type() === 'error') consoleErrors.push({ step, text: message.text() });
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  try {
    for (step = 1; step <= steps; step += 1) {
      if (new URL(page.url()).origin !== origin)
        await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
      const { targets, focused } = await page.evaluate(collectTargets);
      const action = pickAction(random, targets, focused);
      const entry = { step, action: describeAction(action) };
      const work = perform(page, action).then(
        () => undefined,
        (error) => error.message.split('\n')[0],
      );
      const outcome = await within(stallMs, work).catch(() => STALLED);
      actions.push(entry);
      if (outcome === STALLED) {
        entry.stalled = true;
        stalledAt = step;
        break;
      }
      if (outcome !== undefined) entry.skipped = outcome;
      await settle(pause);
      if (!(await shellAlive(page).catch(() => false))) {
        await settle(1500);
        if (!(await shellAlive(page).catch(() => false))) {
          blankAt = step;
          break;
        }
      }
    }
  } finally {
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
  }
  const failedAt = Math.min(
    blankAt ?? Infinity,
    stalledAt ?? Infinity,
    pageErrors[0]?.step ?? Infinity,
  );
  return {
    seed,
    steps: actions.length,
    ok: failedAt === Infinity,
    failedAt: failedAt === Infinity ? undefined : failedAt,
    blankAt,
    stalledAt,
    pageErrors,
    consoleErrors,
    actions,
  };
}
