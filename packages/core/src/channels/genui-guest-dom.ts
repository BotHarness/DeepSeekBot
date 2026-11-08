import './genui-guest-base64.js';
import { parseHTML } from 'linkedom/worker';
import { GENUI_EXECUTION_LIMITS } from './genui-execution-limits.js';
import { GENUI_DOCUMENT_LIMITS } from './genui-document-limits.js';
import type { GenuiDocumentState } from './genui-document.js';
import type { GenuiExecutionControl, GenuiExecutionEvent } from './genui-execution.js';

type LocalEvent = Pick<GenuiExecutionEvent, 'event' | 'targetId' | 'value' | 'checked'>;
type Timer = {
  callback: (...args: unknown[]) => unknown;
  args: unknown[];
  due: number;
  interval: number;
};

function createDom(html: string, initial: GenuiDocumentState, stateful: boolean) {
  const environment = parseHTML(`<!doctype html><html><head></head><body>${html}</body></html>`);
  const document = environment.document;
  const stringify = JSON.stringify.bind(JSON);
  const parse = JSON.parse.bind(JSON);
  const scripts: string[] = [];
  for (const script of document.querySelectorAll('script')) {
    const type = script.getAttribute('type')?.trim().toLowerCase() ?? '';
    if (script.hasAttribute('src') || type === 'module')
      throw Error('Unsupported script source or module.');
    if (type === '' || type === 'text/javascript' || type === 'application/javascript') {
      scripts.push(script.textContent ?? '');
      script.remove();
    } else if (type !== 'application/json' && type !== 'application/ld+json')
      throw Error('Unsupported script type.');
  }
  if (scripts.length > GENUI_EXECUTION_LIMITS.scripts) throw Error('Script budget exceeded.');
  let state: GenuiDocumentState = parse(stringify(initial));
  let time = 0;
  let nextTimer = 1;
  let nextNode = 1;
  let callbackWindow = 0;
  let callbacks = 0;
  const timers = new Map<number, Timer>();
  const nodes = new Map<string, Element>();
  const identities = new WeakMap<Element, string>();
  const clone = (value: unknown) => {
    const serialized = stringify(value);
    if (typeof serialized !== 'string' || serialized.length > GENUI_DOCUMENT_LIMITS.stateBytes)
      throw Error('Private state byte budget exceeded.');
    return parse(serialized);
  };
  const genui = Object.freeze({
    getState: () => clone(state.values),
    setState: (values: GenuiDocumentState['values']) => {
      if (!stateful) throw Error('This document has no registered private state.');
      state = clone({ version: 1, values });
    },
  });
  const schedule = (callback: unknown, delay: unknown, args: unknown[], interval: boolean) => {
    if (typeof callback !== 'function') throw Error('Timer callback must be a function.');
    if (timers.size >= GENUI_EXECUTION_LIMITS.timers || nextTimer >= Number.MAX_SAFE_INTEGER)
      throw Error('Timer budget exceeded.');
    const duration = Math.max(GENUI_EXECUTION_LIMITS.timerMinMs, Number(delay) || 0);
    if (!Number.isFinite(duration) || duration > 2_147_483_647) throw Error('Invalid timer delay.');
    const id = nextTimer++;
    timers.set(id, {
      callback: (...values) => callback(...values),
      args,
      due: time + duration,
      interval: interval ? duration : 0,
    });
    return id;
  };
  Object.defineProperties(globalThis, {
    window: { value: environment, configurable: true },
    document: { value: document, configurable: true },
    genui: { value: genui, configurable: true },
    addEventListener: { value: environment.addEventListener.bind(environment), configurable: true },
    removeEventListener: {
      value: environment.removeEventListener.bind(environment),
      configurable: true,
    },
    dispatchEvent: { value: environment.dispatchEvent.bind(environment), configurable: true },
    setTimeout: {
      value: (callback: unknown, delay: unknown, ...args: unknown[]) =>
        schedule(callback, delay, args, false),
      configurable: true,
    },
    setInterval: {
      value: (callback: unknown, delay: unknown, ...args: unknown[]) =>
        schedule(callback, delay, args, true),
      configurable: true,
    },
    clearTimeout: { value: (id: number) => timers.delete(id), configurable: true },
    clearInterval: { value: (id: number) => timers.delete(id), configurable: true },
  });
  Object.defineProperty(environment.HTMLSelectElement.prototype, 'value', {
    configurable: true,
    get(this: HTMLSelectElement) {
      return [...this.options].find((option) => option.selected)?.value ?? '';
    },
    set(this: HTMLSelectElement, value: string) {
      const chosen = [...this.options].find((option) => option.value === String(value));
      for (const option of this.options) option.selected = false;
      if (chosen) chosen.selected = true;
    },
  });
  const inspect = () => {
    const pending: { node: Node; depth: number }[] = [{ node: document, depth: 0 }];
    nodes.clear();
    let count = 0;
    let controlCount = 0;
    while (pending.length) {
      const current = pending.pop();
      if (!current) break;
      if (++count > GENUI_EXECUTION_LIMITS.nodes || current.depth > GENUI_EXECUTION_LIMITS.domDepth)
        throw Error('DOM node or depth budget exceeded.');
      const node = current.node;
      if (node.nodeType === 1 && 'tagName' in node && node instanceof environment.Element) {
        if (
          node.tagName === 'SCRIPT' &&
          (node.hasAttribute('src') ||
            !['application/json', 'application/ld+json'].includes(
              node.getAttribute('type')?.trim().toLowerCase() ?? '',
            ))
        )
          throw Error('Dynamic scripts are unsupported.');
        if (node.getAttributeNames().some((name) => name.toLowerCase().startsWith('on')))
          throw Error('Inline event handlers are unsupported.');
        let id = identities.get(node);
        if (!id) {
          if (nextNode > GENUI_EXECUTION_LIMITS.nodeId)
            throw Error('DOM identity budget exceeded.');
          id = String(nextNode++);
          identities.set(node, id);
        }
        node.setAttribute('data-genui-node', id);
        nodes.set(id, node);
        if (
          ['INPUT', 'SELECT', 'TEXTAREA'].includes(node.tagName) &&
          ++controlCount > GENUI_EXECUTION_LIMITS.controls
        )
          throw Error('Control budget exceeded.');
      }
      for (let child = node.lastChild; child; child = child.previousSibling)
        pending.push({ node: child, depth: current.depth + 1 });
    }
  };
  const snapshot = () => {
    inspect();
    const controls: GenuiExecutionControl[] = [];
    for (const [id, node] of nodes) {
      if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(node.tagName)) continue;
      controls.push({
        id,
        ...('value' in node && typeof node.value === 'string' ? { value: node.value } : {}),
        ...('checked' in node && typeof node.checked === 'boolean'
          ? { checked: node.checked }
          : {}),
      });
    }
    const mirror = document.cloneNode(true);
    if (!(mirror instanceof environment.Document)) throw Error('Unsupported document clone.');
    for (const script of mirror.querySelectorAll('script')) script.remove();
    return stringify({ html: mirror.toString(), state, controls });
  };
  inspect();
  return Object.freeze({
    scripts: () => stringify(scripts),
    snapshot,
    event: (event: LocalEvent) => {
      const target = nodes.get(event.targetId);
      if (!target || !target.isConnected) throw Error('Unknown or removed DOM node.');
      if (event.value !== undefined) {
        if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
          throw Error('Event target is not a control.');
        Object.assign(target, { value: event.value });
      }
      if (event.checked !== undefined) {
        if (target.tagName !== 'INPUT') throw Error('Checked target is not an input.');
        Object.assign(target, { checked: event.checked });
      }
      target.dispatchEvent(new environment.Event(event.event, { bubbles: true, cancelable: true }));
    },
    restore: (next: GenuiDocumentState) => {
      state = clone(next);
      environment.dispatchEvent(new environment.Event('genui:state'));
    },
    theme: (theme: 'light' | 'dark') => {
      document.documentElement.style.colorScheme = theme;
    },
    nextTimer: () => {
      let next = Infinity;
      for (const timer of timers.values()) next = Math.min(next, timer.due);
      return Number.isFinite(next) ? next : null;
    },
    tick: (now: number) => {
      if (!Number.isFinite(now) || now < time) throw Error('Invalid monotonic timer time.');
      time = now;
      if (time - callbackWindow >= 1000) {
        callbackWindow = time;
        callbacks = 0;
      }
      let executed = 0;
      for (const [id, timer] of Array.from(timers)) {
        if (timer.due > time || !timers.has(id)) continue;
        if (++callbacks > GENUI_EXECUTION_LIMITS.callbacksPerSecond)
          throw Error('Timer callback rate budget exceeded.');
        if (timer.interval) timer.due = time + timer.interval;
        else timers.delete(id);
        timer.callback(...timer.args);
        executed++;
      }
      return executed;
    },
  });
}

Object.defineProperty(globalThis, '__genuiCreateDom', { value: createDom });
