const SPAWNERS = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork']);
const SHELL_RUNNERS = new Set(['exec', 'execSync']);
const CHILD_PROCESS = new Set(['node:child_process', 'child_process']);

const calleeName = (callee) =>
  callee.type === 'Identifier'
    ? callee.name
    : callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.property.type === 'Identifier'
      ? callee.property.name
      : undefined;

const property = (object, name) =>
  object.properties.find(
    (entry) =>
      entry.type === 'Property' &&
      !entry.computed &&
      ((entry.key.type === 'Identifier' && entry.key.name === name) ||
        (entry.key.type === 'Literal' && entry.key.value === name)),
  );

const isLiteral = (node, value) => node?.type === 'Literal' && node.value === value;

const spawnOptions = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Child processes run with direct argv, shell: false and windowsHide: true.',
    },
  },
  create(context) {
    const local = new Map();
    return {
      ImportDeclaration(node) {
        if (!CHILD_PROCESS.has(node.source.value)) return;
        for (const specifier of node.specifiers)
          if (specifier.type === 'ImportSpecifier')
            local.set(specifier.local.name, specifier.imported.name ?? specifier.imported.value);
          else local.set(specifier.local.name, '*');
      },
      CallExpression(node) {
        const { callee } = node;
        let name;
        if (callee.type === 'Identifier') name = local.get(callee.name);
        else if (
          callee.type === 'MemberExpression' &&
          callee.object.type === 'Identifier' &&
          local.get(callee.object.name) === '*'
        )
          name = calleeName(callee);
        if (name === undefined) return;
        if (SHELL_RUNNERS.has(name)) {
          context.report({
            node,
            message: `${name}() runs through a shell; use execFile/spawn with direct argv, shell: false and windowsHide: true.`,
          });
          return;
        }
        if (!SPAWNERS.has(name)) return;
        const options = node.arguments.find((arg) => arg.type === 'ObjectExpression');
        if (options === undefined) {
          if (
            node.arguments.some(
              (arg) => arg.type !== 'ArrayExpression' && arg !== node.arguments[0],
            )
          )
            return;
          context.report({
            node,
            message: `${name}() needs an options object with windowsHide: true.`,
          });
          return;
        }
        const spread = options.properties.some((entry) => entry.type === 'SpreadElement');
        const shell = property(options, 'shell');
        if (shell !== undefined && !isLiteral(shell.value, false))
          context.report({
            node: shell,
            message: `${name}() must not run through a shell; pass direct argv with shell: false.`,
          });
        const hide = property(options, 'windowsHide');
        if (
          hide === undefined
            ? !spread
            : hide.value.type !== 'Literal' || typeof hide.value.value !== 'boolean'
        )
          context.report({
            node: options,
            message: `${name}() needs windowsHide: true so no console window flashes on Windows (false only for a program whose window the user should see).`,
          });
      },
    };
  },
};

const noApiIntercept = {
  meta: {
    type: 'problem',
    docs: { description: 'The API gateway owns the single /api interceptor.' },
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        const [first] = node.arguments;
        if (
          callee.type === 'MemberExpression' &&
          calleeName(callee) === 'intercept' &&
          first?.type === 'Literal' &&
          typeof first.value === 'string' &&
          first.value.startsWith('/api')
        )
          context.report({
            node,
            message:
              "Do not intercept '/api'; register the route through the API gateway (dsh-dev skill, /api transport contract).",
          });
      },
    };
  },
};

export default {
  meta: { name: 'botharness' },
  rules: { 'spawn-options': spawnOptions, 'no-api-intercept': noApiIntercept },
};
