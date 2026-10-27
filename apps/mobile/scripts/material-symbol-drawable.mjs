import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICONS = {
  feedback: 'feedback',
  select: 'check_circle',
  language: 'translate',
  appearance: 'contrast',
  system: 'mobile',
  light: 'light_mode',
  dark: 'dark_mode',
  model: 'memory',
  computer: 'computer',
  notifications: 'notifications',
  storage: 'storage',
  browser: 'open_in_browser',
  folder: 'folder',
  access: 'shield_lock',
  history: 'history',
  rules: 'verified_user',
  unpair: 'link_off',
  appIcon: 'apps',
  activityCount: 'tag',
  background: 'wallpaper',
  version: 'info',
  open: 'open_in_new',
  copy: 'content_copy',
  share: 'share',
  account: 'account_circle',
  qr: 'qr_code_scanner',
  add: 'add',
  check: 'check',
  chevron: 'chevron_right',
  expand: 'expand_more',
  collapse: 'expand_less',
};

const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/;

export function shiftPath(d, dy) {
  const out = [];
  let i = 0;
  const skip = () => {
    while (d[i] === ' ' || d[i] === ',') i++;
  };
  const read = (flag) => {
    skip();
    if (flag) return d[i++];
    const match = NUMBER.exec(d.slice(i));
    if (!match) throw new Error(`Bad path number at ${i}`);
    i += match[0].length;
    return match[0];
  };
  for (skip(); i < d.length; skip()) {
    const start = out.length === 0 && d[i] === 'm';
    const command = start ? 'M' : d[i++];
    if (start) i++;
    const upper = command.toUpperCase();
    const arity = ARITY[upper];
    if (arity === undefined) throw new Error(`Unknown path command ${command}`);
    out.push(command);
    if (arity === 0) continue;
    let relative = command !== upper;
    for (let first = true; ; first = false) {
      skip();
      if (i >= d.length || /[a-z]/i.test(d[i])) break;
      const args = Array.from({ length: arity }, (_, k) =>
        read(upper === 'A' && (k === 3 || k === 4)),
      );
      const shifted = args.map((value, k) => {
        if (relative) return value;
        const y = upper === 'V' || (upper !== 'H' && (upper === 'A' ? k === 6 : k % 2 === 1));
        return y ? String(Math.round((Number(value) + dy) * 1000) / 1000) : value;
      });
      const lineTo = start && !first && !relative;
      if (lineTo) relative = true;
      out.push((first ? '' : lineTo ? 'l' : ' ') + (lineTo ? args : shifted).join(' '));
    }
  }
  return out.join('');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = process.argv[2];
  if (!source) throw new Error('Pass the outlined SVG folder of @material-symbols/svg-400');
  const target = fileURLToPath(new URL('../assets/row-icons/', import.meta.url));
  for (const [name, symbol] of Object.entries(ICONS)) {
    const svg = readFileSync(join(source, `${symbol}.svg`), 'utf8');
    const d = /\sd="([^"]+)"/.exec(svg)?.[1];
    if (!d) throw new Error(`${symbol}.svg has no path`);
    writeFileSync(
      join(target, `${name}.xml`),
      `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="960" android:viewportHeight="960"><path android:fillColor="#FFFFFFFF" android:pathData="${shiftPath(d, 960)}" /></vector>\n`,
    );
  }
}
