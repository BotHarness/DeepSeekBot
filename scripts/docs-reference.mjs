import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import * as ts from 'typescript-legacy';

const EVENT_METHODS = new Set(['on', 'emit', 'parallel', 'serial', 'bail']);

function parse(root, sourcePath) {
  const absolute = join(root, sourcePath);
  return ts.createSourceFile(
    sourcePath,
    readFileSync(absolute, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function bindingMap(source) {
  const bindings = new Map();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        bindings.set(declaration.name.text, declaration.initializer);
      }
    }
  }
  return bindings;
}

function unwrap(expression) {
  if (
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isParenthesizedExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    return unwrap(expression.expression);
  }
  return expression;
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  throw new Error(`docs reference: unsupported property name ${name.getText()}`);
}

function property(object, name) {
  return object.properties.find(
    (candidate) => ts.isPropertyAssignment(candidate) && propertyName(candidate.name) === name,
  );
}

function staticValue(expression, bindings, seen = new Set()) {
  const value = unwrap(expression);
  if (ts.isStringLiteralLike(value) || ts.isNumericLiteral(value)) return value.text;
  if (value.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (value.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (value.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(value) && ts.isNumericLiteral(value.operand)) {
    const number = Number(value.operand.text);
    return value.operator === ts.SyntaxKind.MinusToken ? -number : number;
  }
  if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return (
      String(staticValue(value.left, bindings, seen)) +
      String(staticValue(value.right, bindings, seen))
    );
  }
  if (ts.isIdentifier(value)) {
    if (value.text === 'undefined' && !bindings.has(value.text)) return undefined;
    if (seen.has(value.text)) throw new Error(`docs reference: circular binding ${value.text}`);
    const initializer = bindings.get(value.text);
    if (!initializer) throw new Error(`docs reference: unresolved binding ${value.text}`);
    return staticValue(initializer, bindings, new Set([...seen, value.text]));
  }
  if (ts.isPropertyAccessExpression(value) && ts.isIdentifier(value.expression)) {
    const initializer = bindings.get(value.expression.text);
    if (!initializer) {
      throw new Error(`docs reference: unresolved object ${value.expression.text}`);
    }
    const object = unwrap(initializer);
    if (!ts.isObjectLiteralExpression(object)) {
      throw new Error(`docs reference: ${value.expression.text} is not a static object`);
    }
    const member = property(object, value.name.text);
    if (!member || !ts.isPropertyAssignment(member)) {
      throw new Error(`docs reference: missing ${value.getText()}`);
    }
    return staticValue(member.initializer, bindings, seen);
  }
  if (ts.isArrayLiteralExpression(value)) {
    return value.elements.map((element) => staticValue(element, bindings, seen));
  }
  if (ts.isObjectLiteralExpression(value)) {
    const result = {};
    for (const member of value.properties) {
      if (!ts.isPropertyAssignment(member)) continue;
      result[propertyName(member.name)] = staticValue(member.initializer, bindings, seen);
    }
    return result;
  }
  throw new Error(`docs reference: expression is not static: ${value.getText()}`);
}

function callArgument(expression, methodName) {
  const value = unwrap(expression);
  if (!ts.isCallExpression(value) || !ts.isPropertyAccessExpression(value.expression))
    return undefined;
  if (value.expression.name.text === methodName) return value.arguments[0];
  return callArgument(value.expression.expression, methodName);
}

function collectConfig(root) {
  const sourcePath = 'packages/core/src/plugin.ts';
  const source = parse(root, sourcePath);
  const bindings = bindingMap(source);
  const declaration = source.statements.find(
    (statement) =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === 'BotHarnessConfig',
  );
  const configExpression = bindings.get('Config');
  if (!declaration || !ts.isInterfaceDeclaration(declaration) || !configExpression) {
    throw new Error('docs reference: BotHarnessConfig or Config is missing');
  }
  const configCall = unwrap(configExpression);
  if (!ts.isCallExpression(configCall) || configCall.arguments.length !== 1) {
    throw new Error('docs reference: Config must be a single Schema.object(...) call');
  }
  const schema = unwrap(configCall.arguments[0]);
  if (!ts.isObjectLiteralExpression(schema)) {
    throw new Error('docs reference: Config schema must be a static object');
  }

  const types = new Map();
  for (const member of declaration.members) {
    if (!ts.isPropertySignature(member) || !member.type || !member.name) continue;
    types.set(propertyName(member.name), member.type.getText(source));
  }

  return schema.properties.map((member) => {
    if (!ts.isPropertyAssignment(member)) {
      throw new Error(
        `docs reference: Config contains a non-property member: ${member.getText(source)}`,
      );
    }
    const name = propertyName(member.name);
    const defaultExpression = callArgument(member.initializer, 'default');
    const descriptionExpression = callArgument(member.initializer, 'description');
    return {
      name,
      type: types.get(name) ?? 'unknown',
      default: defaultExpression ? staticValue(defaultExpression, bindings) : undefined,
      description: descriptionExpression
        ? String(staticValue(descriptionExpression, bindings))
        : undefined,
      source: sourcePath,
    };
  });
}

function collectTools(root) {
  const sourcePath = 'packages/core/src/memory/tools.ts';
  if (!existsSync(join(root, sourcePath))) return [];
  const source = parse(root, sourcePath);
  const bindings = bindingMap(source);
  const tools = [];

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineTool'
    ) {
      const definition = unwrap(node.arguments[0]);
      if (!definition || !ts.isObjectLiteralExpression(definition)) {
        throw new Error('docs reference: defineTool must receive a static object');
      }
      const nameMember = property(definition, 'name');
      const descriptionMember = property(definition, 'description');
      const parametersMember = property(definition, 'parameters');
      if (!nameMember || !descriptionMember || !parametersMember) {
        throw new Error('docs reference: tool is missing name, description, or parameters');
      }
      const parameterObject = unwrap(parametersMember.initializer);
      if (!ts.isObjectLiteralExpression(parameterObject)) {
        throw new Error('docs reference: tool parameters must be a static object');
      }
      const parameters = parameterObject.properties.map((member) => {
        if (!ts.isPropertyAssignment(member)) {
          throw new Error('docs reference: tool parameter must be a property assignment');
        }
        const schema = staticValue(member.initializer, bindings);
        return {
          name: propertyName(member.name),
          type:
            schema.type === 'array' && schema.items?.type
              ? `array<${schema.items.type}>`
              : schema.type,
          required: schema.required === true,
          description: schema.description,
        };
      });
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      tools.push({
        name: String(staticValue(nameMember.initializer, bindings)),
        description: String(staticValue(descriptionMember.initializer, bindings)),
        parameters,
        source: `${sourcePath}:${line}`,
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return tools;
}

function typescriptFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...typescriptFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(path);
  }
  return files.sort();
}

function collectPublicEvents(root) {
  const sourceRoot = join(root, 'packages', 'core', 'src');
  const events = [];
  for (const absolute of typescriptFiles(sourceRoot)) {
    const sourcePath = relative(root, absolute);
    const source = parse(root, sourcePath);
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        const receiver = node.expression.expression.getText(source);
        if (EVENT_METHODS.has(method) && /(?:^|\.)[A-Za-z]*ctx$/i.test(receiver)) {
          const event = node.arguments[0];
          if (!event || !ts.isStringLiteralLike(unwrap(event))) {
            throw new Error(
              `docs reference: ${sourcePath} uses ${receiver}.${method} with a non-literal event name`,
            );
          }
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          events.push({
            name: unwrap(event).text,
            direction: method === 'on' ? 'consumes' : 'emits',
            operation: method,
            source: `${sourcePath}:${line}`,
          });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return events.sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
}

export function collectDevReference(root) {
  return {
    config: collectConfig(root),
    tools: collectTools(root),
    publicEvents: collectPublicEvents(root),
  };
}
