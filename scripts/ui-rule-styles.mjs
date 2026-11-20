import { posix } from 'node:path';
import traverseModule from '@babel/traverse';
import postcss from 'postcss';
import { camel, webTokens } from './generate-tokens.mjs';

const traverse = typeof traverseModule === 'function' ? traverseModule : traverseModule.default;

const DS = 'packages/client/src/client/ds';
const STYLE_X = `${DS}/tobs.stylex.ts`;
const LENGTH =
  /^(?:min|max)?(?:width|height|inlineSize|blockSize)$|^(?:padding|margin|inset|gap|rowGap|columnGap|border.*(?:Radius|Width)|outline(?:Width|Offset)|fontSize|lineHeight|letterSpacing|top|right|bottom|left|flexBasis)/iu;
const SPACE = /^(?:padding|margin|gap|rowGap|columnGap)/u;
const COLOR = /(?:Color|^color|^background|^fill|^stroke|Shadow)$/u;
const COLOR_PROPERTY = /(?:Color|^color|^fill|^stroke)$/u;
const COLOR_LITERAL = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/iu;
const CSS_KEYWORD =
  /^(?:none|transparent|currentcolor|inherit|initial|unset|revert(?:-layer)?|context-fill|context-stroke)$/iu;
const PIXELS = /(?<![\w.])-?(?:\d*\.)?\d+px\b/gu;
const CSS_TEXT = /\/\*[\s\S]*?\*\/|url\([^)]*\)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/gu;
const CSS_VAR = /var\(\s*--[\w-]+(?:,[^()]*)?\)/gu;
const TIME = /(?<![\w.-])-?(?:\d*\.)?\d+m?s\b/gu;
const EASING =
  /(?<![\w-])(?:cubic-bezier\([^)]*\)|ease(?:-in-out|-in|-out)?|linear(?:\([^)]*\))?|step-(?:start|end)|steps\([^)]*\))(?![\w-])/gu;
const ACTIVE_MOTION = /^(?:animation(?:Name|Duration)?|transition(?:Duration)?)$/u;
const MOTION_VALUE = /^(?:animation|transition)(?:Duration|Delay|TimingFunction)?$/u;
const REDUCE = /prefers-reduced-motion\s*:\s*reduce/u;
const REDUCED_SELECTOR = /^html\[data-botharness-motion=(["'])reduce\1\]\s*/u;
const REDUCED_VALUE = /^(?:none|0(?:ms|s)?)$/u;
const BREAKPOINT = /\((?=[^()]*\b(?:min-|max-)?(?:device-)?width\b)([^()]*?)(?=\))/gu;
const DIMENSION = /(?<![\w.])(?:\d*\.)?\d+(?:px|r?em|vw|vh|ch)\b/gu;
const EASING_COORDINATES = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
  linear: [0, 0, 1, 1],
};

let tokenRoles;

function roles() {
  if (tokenRoles) return tokenRoles;
  const { leaves, breakpoints } = webTokens();
  tokenRoles = Object.groupBy(
    [
      ...leaves.map(({ path: [, group, ...path], value }) => ({
        group,
        key: camel(path),
        value,
      })),
      ...Object.entries(breakpoints).map(([key, value]) => ({ group: 'breakpoint', key, value })),
    ],
    ({ group }) => group,
  );
  return tokenRoles;
}

function nearest(group, distance, limit = Infinity, filter = () => true) {
  let best;
  let bestDistance = limit;
  for (const token of roles()[group].filter(filter)) {
    const difference = distance(token.value);
    if (difference <= bestDistance && (!best || difference < bestDistance)) {
      best = token;
      bestDistance = difference;
    }
  }
  return best;
}

function lengthToken(property, px) {
  if (px < 0) return undefined;
  if (SPACE.test(property)) return nearest('space', (v) => Math.abs(px - parseFloat(v)), 2);
  if (/radius/iu.test(property)) return nearest('radius', (v) => Math.abs(px - parseFloat(v)), 2);
  if (/^(?:border|outline)/u.test(property))
    return nearest('edge', (v) => Math.abs(px - parseFloat(v)), 2);
  const suffix = { fontSize: 'Size', lineHeight: 'Line' }[property];
  return suffix
    ? nearest(
        'type',
        (v) => Math.abs(px - parseFloat(v)),
        2,
        ({ key }) => key.endsWith(suffix),
      )
    : nearest('size', (v) => Math.abs(px - parseFloat(v)), 2);
}

function durationMs(value) {
  return typeof value === 'string' ? parseFloat(value) * (value.endsWith('ms') ? 1 : 1000) : NaN;
}

function bezier(value) {
  if (Array.isArray(value)) return value;
  return value.startsWith('cubic-bezier(')
    ? value.slice('cubic-bezier('.length, -1).split(',').map(Number)
    : EASING_COORDINATES[value];
}

function easingToken(value) {
  const coordinates = bezier(value);
  if (!coordinates) return undefined;
  return nearest('motion', (v) =>
    bezier(v)?.reduce((sum, coordinate, index) => sum + (coordinate - coordinates[index]) ** 2, 0),
  );
}

function nameOf(property) {
  if (property.key?.type === 'StringLiteral') return property.key.value;
  if (property.key?.type === 'Identifier' && !property.computed) return property.key.name;
  return undefined;
}

function literalParts(node) {
  if (node?.type === 'StringLiteral' && node.value === node.extra?.raw.slice(1, -1))
    return [{ text: node.value, start: node.start + 1, end: node.end - 1, quoted: node }];
  if (node?.type === 'TemplateLiteral')
    return node.quasis.map((part) => ({
      text: part.value.raw,
      start: part.start,
      end: part.end,
      node: part,
    }));
  return [];
}

function cssProperty(name) {
  return name.startsWith('--')
    ? name
    : name.replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
}

function objectValue(node) {
  while (node?.type === 'TSAsExpression' || node?.type === 'TSSatisfiesExpression')
    node = node.expression;
  return node;
}

function numberValue(node) {
  if (node.type === 'NumericLiteral') return node.value;
  if (
    node.type === 'UnaryExpression' &&
    (node.operator === '-' || node.operator === '+') &&
    node.argument.type === 'NumericLiteral'
  )
    return node.operator === '-' ? -node.argument.value : node.argument.value;
  return undefined;
}

function canReduceMotion(property) {
  return ACTIVE_MOTION.test(property) || property === 'transitionProperty';
}

function hasReducedMotion(base, overrides, family) {
  return [...overrides].some(
    ([property, value]) => property.startsWith(family) && value !== base.get(property),
  );
}

function reducedStyle(block, family, source) {
  const base = new Map();
  const overrides = new Map();
  const record = (map, property, expression) => {
    const value = objectValue(expression);
    if (value && canReduceMotion(property))
      map.set(
        property,
        value.type === 'StringLiteral' ? value.value : source.slice(value.start, value.end),
      );
  };
  for (const entry of block.properties) {
    const key = nameOf(entry);
    const value = objectValue(entry.value);
    if (!key || !value) continue;
    if (value.type !== 'ObjectExpression') record(base, key, value);
    else if (REDUCE.test(key)) {
      for (const override of value.properties) record(overrides, nameOf(override), override.value);
    } else if (canReduceMotion(key)) {
      for (const condition of value.properties) {
        const name = nameOf(condition);
        if (name === 'default') record(base, key, condition.value);
        else if (REDUCE.test(name ?? '')) record(overrides, key, condition.value);
      }
    }
  }
  return hasReducedMotion(base, overrides, family);
}

function addStyleLiterals(property, part, add, namedColor) {
  if (
    COLOR.test(property) &&
    (COLOR_LITERAL.test(part.text) ||
      (namedColor &&
        COLOR_PROPERTY.test(property) &&
        /^[a-z]+$/iu.test(part.text) &&
        !CSS_KEYWORD.test(part.text)))
  )
    add('styleLiteral', `${property}: ${part.text}`, part.start);
  for (const match of part.text.matchAll(PIXELS)) {
    const px = parseFloat(match[0]);
    if (px === 0) continue;
    const plain = part.quoted && part.text === match[0] && LENGTH.test(property);
    add(
      'styleLiteral',
      `${property}: ${match[0]}`,
      part.start + match.index,
      plain ? { token: lengthToken(property, px), direct: part.quoted } : undefined,
    );
  }
}

function addMotionTokens(property, part, add) {
  if (!MOTION_VALUE.test(property)) return;
  for (const match of part.text.matchAll(CSS_VAR))
    add('motionToken', `${property}: ${match[0]}`, part.start + match.index);
  const valueText = part.text.replace(CSS_VAR, (match) => ' '.repeat(match.length));
  if (!property.endsWith('TimingFunction'))
    for (const match of valueText.matchAll(TIME)) {
      const time = durationMs(match[0]);
      if (time === 0) continue;
      const token = nearest('motion', (value) => Math.abs(time - durationMs(value)));
      add('motionToken', `${property}: ${match[0]}`, part.start + match.index, {
        part,
        match,
        token,
      });
    }
  if (!/(?:Duration|Delay)$/u.test(property))
    for (const match of valueText.matchAll(EASING))
      add('motionToken', `${property}: ${match[0]}`, part.start + match.index, {
        part,
        match,
        token: easingToken(match[0]),
      });
}

function cssTemplate(node, source) {
  if (!node.quasis.some(({ value }) => /(?:^|[}\n])\s*(?:[@.#[\w][^{}\n]*\{)/u.test(value.raw)))
    return undefined;
  const start = node.quasis[0].start;
  let css = '';
  let previous = start;
  for (const part of node.quasis) {
    css += source.slice(previous, part.start).replace(/[^\n]/g, '_') + part.value.raw;
    previous = part.end;
  }
  try {
    return { css: postcss.parse(css), start };
  } catch {
    return undefined;
  }
}

function inspectCss({ css, start }, node, source, add) {
  const selectors = new Map();
  const active = [];
  css.walkDecls((decl) => {
    const property = cssProperty(decl.prop);
    const offset = start + decl.source.start.offset;
    const begin = offset + decl.prop.length + decl.raws.between.length;
    const value = decl.raws.value?.raw ?? decl.value;
    const plain = value.replace(CSS_TEXT, (match) => ' '.repeat(match.length));
    addStyleLiterals(property, { text: plain, start: begin }, add, true);
    if (decl.parent.type !== 'rule') return;
    addMotionTokens(property, { text: value, start: begin, node }, add);
    if (!canReduceMotion(property)) return;
    const selector = decl.parent.selector;
    const isReduced =
      REDUCE.test(decl.parent.parent.params ?? '') || REDUCED_SELECTOR.test(selector);
    const key = selector.replace(REDUCED_SELECTOR, '');
    const style = selectors.get(key) ?? { base: new Map(), overrides: new Map() };
    selectors.set(key, style);
    const values = isReduced ? style.overrides : style.base;
    values.set(property, source.slice(begin, begin + value.length));
    if (!isReduced && ACTIVE_MOTION.test(property) && !REDUCED_VALUE.test(value))
      active.push({ selector, style, property, offset });
  });
  for (const { selector, style, property, offset } of active) {
    const family = property.startsWith('animation') ? 'animation' : 'transition';
    if (!hasReducedMotion(style.base, style.overrides, family))
      add('reducedMotion', `${selector} ${property}`, offset);
  }
}

export function desktopStyles(source, file, ast, walk) {
  if (file === STYLE_X || file === `${DS}/tobs-tokens.generated.ts`) return [];
  const found = [];
  const seen = new Set();
  const add = (rule, text, offset, candidate) => {
    const key = `${rule}:${offset}:${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    const edit = candidate?.token ? candidate : undefined;
    found.push({ rule, file, line: source.slice(0, offset).split('\n').length, text, edit });
  };
  const mediaArguments = new Set();
  const topLevelConstants = new Map();
  const inspectedStyles = new Set();
  const keyedLiterals = new Map();
  const styleNamespaces = new Set();
  const styleImports = new Map();
  for (const statement of ast.program.body) {
    const declaration = statement.declaration ?? statement;
    if (declaration.type === 'VariableDeclaration' && declaration.kind === 'const')
      for (const { id, init } of declaration.declarations)
        if (id.type === 'Identifier') topLevelConstants.set(id.name, init);
    if (statement.type !== 'ImportDeclaration' || statement.source.value !== '@stylexjs/stylex')
      continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportSpecifier')
        styleImports.set(specifier.local.name, specifier.imported.name);
      else styleNamespaces.add(specifier.local.name);
    }
  }
  function inspectValue(property, expression, block, isReduced) {
    const value = objectValue(expression);
    if (value.type === 'ConditionalExpression') {
      inspectValue(property, value.consequent, block, isReduced);
      inspectValue(property, value.alternate, block, isReduced);
      return;
    }
    const number = numberValue(value);
    if (number !== undefined && number !== 0 && LENGTH.test(property) && property !== 'lineHeight')
      add('styleLiteral', `${property}: ${number}`, value.start, {
        token: lengthToken(property, number),
        direct: value,
      });
    for (const part of literalParts(value)) {
      addStyleLiterals(property, part, add, value.type === 'StringLiteral');
      addMotionTokens(property, part, add);
    }
    if (
      !isReduced &&
      ACTIVE_MOTION.test(property) &&
      !REDUCED_VALUE.test(String(value.value)) &&
      !reducedStyle(block, property.startsWith('animation') ? 'animation' : 'transition', source)
    )
      add('reducedMotion', property, value.start);
  }
  function inspectBlock(block, owner = block, isReduced = false) {
    if (inspectedStyles.has(block)) return;
    inspectedStyles.add(block);
    for (const property of block.properties) {
      const name = nameOf(property);
      if (!name || !property.value) continue;
      const value = objectValue(property.value);
      if (value.type !== 'ObjectExpression') inspectValue(name, value, owner, isReduced);
      else if (name.startsWith('@') || name.startsWith(':'))
        inspectBlock(value, owner, isReduced || REDUCE.test(name));
      else
        for (const condition of value.properties) {
          if (condition.type === 'ObjectProperty')
            inspectValue(
              name,
              condition.value,
              owner,
              isReduced || REDUCE.test(nameOf(condition) ?? ''),
            );
        }
    }
  }
  walk(ast.program, (node) => {
    if (node.type === 'ObjectProperty' && node.key.type === 'StringLiteral')
      keyedLiterals.set(node.key, node.computed);
    if (node.type === 'CallExpression') {
      const callee = node.callee;
      const method =
        callee.type === 'MemberExpression' ? callee.property.name : styleImports.get(callee.name);
      if (['matchMedia', 'viewportMedia'].includes(callee.name ?? method))
        mediaArguments.add(node.arguments[0]);
      if (
        ['create', 'keyframes'].includes(method) &&
        (callee.type === 'Identifier' || styleNamespaces.has(callee.object.name))
      ) {
        const definition = node.arguments[0];
        if (definition?.type === 'ObjectExpression')
          for (const entry of definition.properties) {
            if (entry.value?.type === 'ObjectExpression') inspectBlock(entry.value);
            if (
              ['ArrowFunctionExpression', 'FunctionExpression'].includes(entry.value?.type) &&
              entry.value.body.type === 'ObjectExpression'
            )
              inspectBlock(entry.value.body);
          }
      }
    }
    if (node.type === 'JSXAttribute' && node.name.name === 'style') {
      const expression = objectValue(node.value?.expression);
      const value =
        expression?.type === 'Identifier'
          ? objectValue(topLevelConstants.get(expression.name))
          : expression;
      if (value?.type === 'ObjectExpression') inspectBlock(value);
    }
    if (node.type === 'TSSatisfiesExpression' || node.type === 'TSAsExpression') {
      const typeName = node.typeAnnotation.typeName;
      if (
        (typeName?.name ?? typeName?.right?.name) === 'CSSProperties' &&
        node.expression.type === 'ObjectExpression'
      )
        inspectBlock(node.expression);
    }
    if (node.type === 'TemplateLiteral') {
      const parsed = cssTemplate(node, source);
      if (parsed) inspectCss(parsed, node, source, add);
    }
    for (const part of literalParts(node)) {
      if (
        !part.text.includes('@media') &&
        !mediaArguments.has(node) &&
        !/^\(\s*(?:(?:min|max)-)?width\b/u.test(part.text)
      )
        continue;
      for (const query of part.text.matchAll(BREAKPOINT)) {
        const begin = query.index + 1;
        for (const match of query[1].matchAll(DIMENSION)) {
          const token = match[0].endsWith('px')
            ? nearest('breakpoint', (value) => Math.abs(parseFloat(value) - parseFloat(match[0])))
            : undefined;
          const isMediaKey = part.quoted && part.text.startsWith('@media');
          const bound = /^@media \((min|max)-width:\s*[\d.]+px\)$/u.exec(part.text)?.[1];
          const edit = isMediaKey
            ? {
                token:
                  token && bound ? { group: 'media', key: camel([bound, token.key]) } : undefined,
                direct: part.quoted,
                computedKey: keyedLiterals.get(node) === false,
              }
            : { part, match: { 0: match[0], index: begin + match.index }, token };
          add('breakpoint', match[0], part.start + begin + match.index, edit);
        }
      }
    }
  });
  return found.sort((a, b) => a.line - b.line);
}

export function fixDesktopStyles(source, file, ast, found) {
  const edits = [];
  const strings = new Map();
  const bindings = new Map();
  let target = posix.relative(posix.dirname(file), STYLE_X).replace(/\.ts$/u, '.js');
  if (!target.startsWith('.')) target = `./${target}`;
  const declaration = ast.program.body.find(
    (node) =>
      node.type === 'ImportDeclaration' &&
      node.importKind !== 'type' &&
      node.source.value === target &&
      !node.specifiers.some((specifier) => specifier.type === 'ImportNamespaceSpecifier'),
  );
  function binding(group) {
    if (bindings.has(group)) return bindings.get(group);
    const existing = declaration?.specifiers.find(
      (item) =>
        item.type === 'ImportSpecifier' &&
        item.importKind !== 'type' &&
        item.imported.name === group,
    );
    let name = existing?.local.name ?? group;
    if (!existing) {
      const used = (candidate) => new RegExp(`\\b${candidate}\\b`, 'u').test(source);
      for (let suffix = 1; used(name); suffix += 1)
        name = `tobs${group[0].toUpperCase()}${group.slice(1)}${suffix}`;
    }
    const entry = { name, existing };
    bindings.set(group, entry);
    return entry;
  }
  const scopes = new Map();
  for (const { edit } of found) {
    if (edit && binding(edit.token.group).existing)
      scopes.set(edit.direct ?? edit.part.quoted ?? edit.part.node, undefined);
  }
  if (scopes.size)
    traverse(ast, {
      enter(path) {
        if (scopes.has(path.node)) scopes.set(path.node, path.scope);
      },
    });
  for (const { edit } of found) {
    if (!edit) continue;
    const { token, direct, part, match, computedKey } = edit;
    const { name, existing } = binding(token.group);
    if (
      existing &&
      scopes.get(direct ?? part.quoted ?? part.node)?.getBinding(name)?.path.node !== existing
    )
      continue;
    const reference = `${name}.${token.key}`;
    if (direct)
      edits.push({
        start: direct.start,
        end: direct.end,
        next: computedKey ? `[${reference}]` : reference,
      });
    else {
      const start = part.start + match.index;
      const change = { start, end: start + match[0].length, next: '${' + reference + '}' };
      if (!part.quoted) edits.push(change);
      else {
        const entry = strings.get(part.start) ?? { part, changes: [] };
        entry.changes.push(change);
        strings.set(part.start, entry);
      }
    }
  }
  const apply = (text, changes, base = 0) =>
    changes
      .sort((a, b) => b.start - a.start)
      .reduce(
        (current, { start, end, next }) =>
          current.slice(0, start - base) + next + current.slice(end - base),
        text,
      );
  for (const { part, changes } of strings.values()) {
    const next = '`' + apply(part.text, changes, part.start) + '`';
    edits.push({
      start: part.quoted.start,
      end: part.quoted.end,
      next,
    });
  }
  const imports = [...bindings]
    .filter(([, entry]) => !entry.existing)
    .map(([group, { name }]) => (group === name ? name : `${group} as ${name}`));
  if (imports.length) {
    const firstSpecifier = declaration?.specifiers.find((item) => item.type === 'ImportSpecifier');
    if (firstSpecifier)
      edits.push({
        start: firstSpecifier.start,
        end: firstSpecifier.start,
        next: `${imports.join(', ')}, `,
      });
    else {
      const start = ast.program.body[0]?.start ?? source.length;
      edits.push({
        start,
        end: start,
        next: `import { ${imports.join(', ')} } from '${target}';\n`,
      });
    }
  }
  return apply(source, edits);
}
