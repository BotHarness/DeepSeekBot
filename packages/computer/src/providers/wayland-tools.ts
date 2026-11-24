import type { DriverToolDescriptor } from '../tool/driver.js';

const coordinate = { type: 'number', minimum: 0 };
const point = { x: coordinate, y: coordinate };
const key = { type: 'string', minLength: 1, maxLength: 48 };
const buttons = ['left', 'right', 'middle'];
const directions = ['up', 'down', 'left', 'right'];
const tool = (
  name: string,
  description: string,
  properties: Readonly<Record<string, unknown>>,
  required: readonly string[] = [],
): DriverToolDescriptor => ({
  name,
  description,
  inputSchema: { type: 'object', properties, required, additionalProperties: false },
});

export const waylandTools = [
  tool(
    'get_desktop_state',
    'Capture the shared Wayland screen. Take a fresh screenshot before input.',
    {},
  ),
  tool(
    'click',
    'Click using pixel coordinates from the latest Wayland screenshot.',
    {
      ...point,
      button: { type: 'string', enum: buttons },
      count: { type: 'integer', minimum: 1, maximum: 2 },
    },
    ['x', 'y'],
  ),
  tool(
    'scroll',
    'Scroll at the pointer or at pixel coordinates from the latest Wayland screenshot.',
    {
      ...point,
      direction: { type: 'string', enum: directions },
      amount: { type: 'number', exclusiveMinimum: 0, maximum: 120 },
    },
    ['direction'],
  ),
  tool(
    'type_text',
    'Type into the focused app. Leave credentials to the Human.',
    {
      text: { type: 'string', maxLength: 1024 },
    },
    ['text'],
  ),
  tool('press_key', 'Press one key in the focused app, such as Enter or Escape.', { key }, ['key']),
  tool(
    'hotkey',
    'Press a key combination in the focused app, such as ["Ctrl", "l"].',
    {
      keys: { type: 'array', items: key, minItems: 1, maxItems: 5 },
    },
    ['keys'],
  ),
];

function number(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function coordinateValue(value: unknown): value is number {
  return number(value) && value >= 0;
}

function keyName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-zA-Z0-9_ +.,/;:'"=\\\[\]<>?`~!@#$%^&*()|-]{1,48}$/u.test(value)
  );
}

export function waylandArguments(
  method: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (method === 'get_desktop_state' || method === 'get_screen_size') return {};
  if (
    args['pid'] !== undefined ||
    args['window_id'] !== undefined ||
    args['element_index'] !== undefined ||
    args['delivery_mode'] === 'background' ||
    (args['scope'] !== undefined && args['scope'] !== 'desktop')
  )
    throw new Error(
      'The Wayland portal sends input to the shared desktop. Observe the screen and use foreground input.',
    );
  const { x, y, button, count, direction, amount, text, key, keys } = args;
  const at = coordinateValue(x) && coordinateValue(y) ? { x, y } : undefined;
  switch (method) {
    case 'click':
      if (
        at &&
        (button === undefined || (typeof button === 'string' && buttons.includes(button))) &&
        (count === undefined || count === 1 || count === 2)
      )
        return { ...at, button: button ?? 'left', count: count ?? 1 };
      break;
    case 'scroll':
      if (
        (at || (x === undefined && y === undefined)) &&
        typeof direction === 'string' &&
        directions.includes(direction) &&
        (amount === undefined || (number(amount) && amount > 0 && amount <= 120))
      )
        return { ...at, direction, amount: amount ?? 3 };
      break;
    case 'type_text':
      if (typeof text === 'string' && text.length <= 1024 && !/[^\P{Cc}\n\t]/u.test(text))
        return { text };
      break;
    case 'press_key':
      if (keyName(key)) return { key };
      break;
    case 'hotkey':
      if (Array.isArray(keys) && keys.length > 0 && keys.length <= 5 && keys.every(keyName))
        return { keys };
      break;
    default:
      throw new Error('This Computer action is unavailable on the shared Wayland desktop.');
  }
  throw new Error('The Wayland desktop input arguments are invalid.');
}

export function waylandResult(method: string, value: Record<string, unknown>): unknown {
  if (method !== 'get_desktop_state' && method !== 'get_screen_size')
    return { content: [{ type: 'text', text: 'Input sent to the shared desktop.' }] };
  const { width, height, image } = value;
  if (!number(width) || !number(height) || width <= 0 || height <= 0)
    throw new Error('The Wayland desktop did not provide a screen size.');
  if (method === 'get_screen_size') return { structuredContent: { width, height } };
  if (typeof image !== 'string' || image.length === 0 || image.length > 5_334_000)
    throw new Error('The Wayland desktop did not provide a frame.');
  return {
    content: [{ type: 'image', data: image, mimeType: 'image/jpeg' }],
    structuredContent: { screenshot_width: width, screenshot_height: height },
  };
}
