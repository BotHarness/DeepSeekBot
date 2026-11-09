import { GENUI_DEFAULT_CSS } from './genui-appearance.js';
import { GENUI_EXECUTION_LIMITS } from './genui-execution-limits.js';
import type {
  GenuiExecutionCommand,
  GenuiExecutionSnapshot,
} from './genui-execution-supervisor.js';

export { GENUI_MIRROR_CSP, GENUI_MIRROR_SHELL } from './genui-mirror-shell.js';
const htmlTags = new Set(
  'a abbr address article aside b bdi bdo blockquote br button caption code col colgroup data datalist dd del details dfn div dl dt em fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr i input ins kbd label legend li main mark meter nav ol optgroup option output p pre progress q rp rt ruby s samp section select small span strong style sub summary sup table tbody td textarea tfoot th thead time tr u ul var wbr'.split(
    ' ',
  ),
);
const svgTags = new Set(
  'svg g path rect circle ellipse line polyline polygon text tspan title desc defs linearGradient radialGradient stop clipPath marker pattern symbol foreignObject'.split(
    ' ',
  ),
);
const blockedAttributes = new Set(
  'src srcset srcdoc action formaction formtarget target download ping autofocus is nonce integrity background poster'.split(
    ' ',
  ),
);
const controlTags = new Set(['INPUT', 'SELECT', 'TEXTAREA']);
const encoder = new TextEncoder();

export class GenuiMirrorError extends Error {
  constructor(
    readonly reason: 'resource' | 'unsupported' | 'invalid-content',
    detail: string,
  ) {
    super(detail);
    this.name = 'GenuiMirrorError';
  }
}

function checkCss(source: string): void {
  if (encoder.encode(source).byteLength > 16_384)
    throw new GenuiMirrorError('resource', 'Stylesheet byte budget exceeded.');
  if (
    /\\|\b(?:filter|backdrop-filter|animation(?:-[a-z-]+)?|transition(?:-[a-z-]+)?)\s*:/iu.test(
      source,
    )
  )
    throw new GenuiMirrorError('unsupported', 'Unsupported CSS escape or effect.');
  for (const match of source.matchAll(/@([a-z-]+)/giu))
    if (!['media', 'supports', 'layer'].includes(match[1]?.toLowerCase() ?? ''))
      throw new GenuiMirrorError('unsupported', 'Unsupported CSS rule.');
  for (const match of source.matchAll(/\burl\s*\(([^)]*)\)/giu))
    if (!/^\s*['"]?#[a-zA-Z0-9_.:-]+['"]?\s*$/u.test(match[1] ?? ''))
      throw new GenuiMirrorError('unsupported', 'External CSS resources are unavailable.');
  let depth = 0;
  let rules = 0;
  for (const character of source) {
    if (character === '{' && ++rules > 128)
      throw new GenuiMirrorError('resource', 'CSS rule budget exceeded.');
    if (character === '{' || character === '(' || character === '[') depth++;
    else if (character === '}' || character === ')' || character === ']') depth--;
    if (depth < 0 || depth > 32)
      throw new GenuiMirrorError('resource', 'CSS nesting budget exceeded.');
  }
}

function element(node: Node): node is Element {
  return node.nodeType === 1 && 'localName' in node && 'namespaceURI' in node;
}

function ownedElement(target: EventTarget | null, document: Document): target is Element {
  return (
    target !== null &&
    'nodeType' in target &&
    target.nodeType === 1 &&
    'ownerDocument' in target &&
    target.ownerDocument === document &&
    'closest' in target &&
    typeof target.closest === 'function'
  );
}

function prepare(document: Document, snapshot: GenuiExecutionSnapshot) {
  if (encoder.encode(snapshot.html).byteLength > GENUI_EXECUTION_LIMITS.htmlBytes)
    throw new GenuiMirrorError('resource', 'Mirror HTML byte budget exceeded.');
  const template = document.createElement('template');
  template.innerHTML = snapshot.html;
  const nodes = new Map<string, Element>();
  const styles: string[] = [];
  const pending = Array.from(template.content.childNodes, (node) => ({ node, depth: 0 }));
  let count = 0;
  while (pending.length) {
    const entry = pending.pop();
    if (!entry) break;
    if (++count > GENUI_EXECUTION_LIMITS.nodes || entry.depth > GENUI_EXECUTION_LIMITS.domDepth)
      throw new GenuiMirrorError('resource', 'Mirror DOM budget exceeded.');
    const node = entry.node;
    if (element(node)) {
      const svg = node.namespaceURI === 'http://www.w3.org/2000/svg';
      if (!svg && ['meta', 'base', 'title'].includes(node.localName)) {
        node.remove();
        continue;
      }
      if (
        !(svg
          ? svgTags.has(node.localName)
          : node.namespaceURI === 'http://www.w3.org/1999/xhtml' && htmlTags.has(node.localName))
      )
        throw new GenuiMirrorError('unsupported', 'Unsupported document element.');
      if (node.attributes.length > 32)
        throw new GenuiMirrorError('resource', 'Attribute count budget exceeded.');
      const id = node.getAttribute('data-genui-node');
      if (id !== null) {
        if (
          !/^[1-9][0-9]{0,9}$/u.test(id) ||
          Number(id) > GENUI_EXECUTION_LIMITS.nodeId ||
          nodes.has(id)
        )
          throw new GenuiMirrorError('invalid-content', 'Invalid mirror node identity.');
        nodes.set(id, node);
      }
      for (const attribute of Array.from(node.attributes)) {
        const name = attribute.name.toLowerCase();
        if (
          encoder.encode(attribute.value).byteLength >
          (name === 'd' || name === 'points' ? 8192 : 4096)
        )
          throw new GenuiMirrorError('resource', 'Attribute byte budget exceeded.');
        if (
          name.startsWith('on') ||
          blockedAttributes.has(name) ||
          ((name === 'href' || name === 'xlink:href') &&
            !/^#[a-zA-Z0-9_.:-]+$/u.test(attribute.value))
        )
          node.removeAttributeNode(attribute);
        else if (name === 'style') checkCss(attribute.value);
        else if (/\burl\s*\(/iu.test(attribute.value)) checkCss(`value:${attribute.value}`);
        else if (name === 'filter' || name === 'mask')
          throw new GenuiMirrorError('unsupported', 'Unsupported SVG effect.');
      }
      if (
        node.localName === 'input' &&
        ['file', 'password', 'image'].includes(node.getAttribute('type')?.toLowerCase() ?? '')
      )
        throw new GenuiMirrorError('unsupported', 'Unsupported private or file input.');
      if (node.localName === 'style') {
        if (styles.length >= 32)
          throw new GenuiMirrorError('resource', 'Stylesheet count budget exceeded.');
        const source = node.textContent ?? '';
        checkCss(source);
        styles.unshift(source);
        node.remove();
      } else
        for (const child of node.childNodes) pending.push({ node: child, depth: entry.depth + 1 });
    } else if (node.nodeType !== 3) node.parentNode?.removeChild(node);
  }
  const css = styles.join('\n');
  checkCss(css);
  if (snapshot.controls.length > GENUI_EXECUTION_LIMITS.controls)
    throw new GenuiMirrorError('resource', 'Mirror control budget exceeded.');
  const controls = new Set<string>();
  for (const control of snapshot.controls) {
    const node = nodes.get(control.id);
    if (!node || !controlTags.has(node.tagName) || controls.has(control.id))
      throw new GenuiMirrorError('invalid-content', 'Unknown mirror control identity.');
    controls.add(control.id);
  }
  return { fragment: template.content, css };
}

function reconcile(target: Node, source: Node): void {
  if (element(target) && element(source)) {
    for (const attribute of Array.from(target.attributes))
      if (!source.hasAttribute(attribute.name)) target.removeAttributeNode(attribute);
    for (const attribute of source.attributes)
      if (target.getAttribute(attribute.name) !== attribute.value)
        target.setAttribute(attribute.name, attribute.value);
  }
  const expected = Array.from(source.childNodes);
  for (let index = 0; index < expected.length; index++) {
    const next = expected[index];
    if (!next) continue;
    const identity = element(next) ? next.getAttribute('data-genui-node') : null;
    let current = target.childNodes[index];
    if (
      identity &&
      (!current || !element(current) || current.getAttribute('data-genui-node') !== identity)
    ) {
      const retained = Array.from(target.childNodes).find(
        (node) => element(node) && node.getAttribute('data-genui-node') === identity,
      );
      if (retained) {
        target.insertBefore(retained, current ?? null);
        current = target.childNodes[index];
      }
    }
    if (
      !current ||
      current.nodeType !== next.nodeType ||
      (element(current) &&
        element(next) &&
        (current.localName !== next.localName ||
          current.namespaceURI !== next.namespaceURI ||
          current.getAttribute('data-genui-node') !== identity))
    ) {
      const replacement = next.cloneNode(true);
      if (current) target.replaceChild(replacement, current);
      else target.appendChild(replacement);
    } else if (element(current) && element(next)) reconcile(current, next);
    else if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
  }
  while (target.childNodes.length > expected.length) {
    const last = target.lastChild;
    if (!last) break;
    target.removeChild(last);
  }
}

export class GenuiDomMirror {
  private disposed = false;
  private readonly defaults: HTMLStyleElement;
  private readonly author: HTMLStyleElement;
  private readonly removers: (() => void)[] = [];
  private readonly document: Document;
  private send: ((command: GenuiExecutionCommand) => void) | undefined;
  private composing: Element | undefined;

  constructor(document: Document, send: (command: GenuiExecutionCommand) => void) {
    this.document = document;
    this.send = send;
    this.defaults = document.createElement('style');
    this.defaults.textContent = GENUI_DEFAULT_CSS;
    this.author = document.createElement('style');
    document.head.append(this.defaults, this.author);
    for (const type of ['input', 'change', 'click']) {
      const listener = (event: Event) => this.event(type, event);
      document.body.addEventListener(type, listener);
      this.removers.push(() => document.body.removeEventListener(type, listener));
    }
    const started = (event: Event) => {
      if (ownedElement(event.target, this.document)) this.composing = event.target;
    };
    document.body.addEventListener('compositionstart', started);
    this.removers.push(() => document.body.removeEventListener('compositionstart', started));
    const composed = (event: Event) => {
      this.composing = undefined;
      this.event('input', event);
    };
    document.body.addEventListener('compositionend', composed);
    this.removers.push(() => document.body.removeEventListener('compositionend', composed));
    const submit = (event: Event) => event.preventDefault();
    document.body.addEventListener('submit', submit, true);
    this.removers.push(() => document.body.removeEventListener('submit', submit, true));
  }

  paint(snapshot: GenuiExecutionSnapshot, preserveControls: ReadonlySet<string> = new Set()): void {
    if (this.disposed) return;
    const prepared = prepare(this.document, snapshot);
    if (this.author.textContent !== prepared.css) this.author.textContent = prepared.css;
    const active = this.document.activeElement;
    const activeId = active?.getAttribute('data-genui-node');
    const selection =
      active &&
      'selectionStart' in active &&
      typeof active.selectionStart === 'number' &&
      'selectionEnd' in active &&
      typeof active.selectionEnd === 'number'
        ? { start: active.selectionStart, end: active.selectionEnd }
        : undefined;
    reconcile(this.document.body, prepared.fragment);
    const nodes = new Map(
      Array.from(this.document.body.querySelectorAll('[data-genui-node]'), (node) => [
        node.getAttribute('data-genui-node'),
        node,
      ]),
    );
    for (const control of snapshot.controls) {
      const node = nodes.get(control.id);
      if (!node || preserveControls.has(control.id) || node === this.composing) continue;
      if (control.value !== undefined && 'value' in node && node.value !== control.value)
        node.value = control.value;
      if (control.checked !== undefined && 'checked' in node && node.checked !== control.checked)
        node.checked = control.checked;
    }
    const retained = activeId ? nodes.get(activeId) : undefined;
    if (retained && 'focus' in retained && typeof retained.focus === 'function') {
      retained.focus({ preventScroll: true });
      if (
        selection &&
        retained !== this.composing &&
        'selectionStart' in retained &&
        typeof retained.selectionStart === 'number' &&
        'setSelectionRange' in retained &&
        typeof retained.setSelectionRange === 'function'
      )
        retained.setSelectionRange(selection.start, selection.end);
    }
  }

  theme(theme: 'light' | 'dark'): void {
    if (!this.disposed && (theme === 'light' || theme === 'dark'))
      this.document.documentElement.style.colorScheme = theme;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.send = undefined;
    for (const remove of this.removers.splice(0)) remove();
    this.document.body.replaceChildren();
    this.author.remove();
    this.defaults.remove();
  }

  private event(type: string, event: Event): void {
    if (this.disposed || (type !== 'input' && type !== 'change' && type !== 'click')) return;
    if (type === 'input' && 'isComposing' in event && event.isComposing === true) return;
    const target = event.target;
    if (!ownedElement(target, this.document) || !this.document.body.contains(target)) return;
    const node = target.closest('[data-genui-node]');
    const targetId = node?.getAttribute('data-genui-node');
    if (!node || !targetId) return;
    if (type === 'click' && node.localName === 'a') event.preventDefault();
    this.send?.({
      type: 'event',
      event: type,
      targetId,
      ...(controlTags.has(node.tagName) && 'value' in node && typeof node.value === 'string'
        ? { value: node.value }
        : {}),
      ...(node.tagName === 'INPUT' && 'checked' in node && typeof node.checked === 'boolean'
        ? { checked: node.checked }
        : {}),
    });
  }
}
