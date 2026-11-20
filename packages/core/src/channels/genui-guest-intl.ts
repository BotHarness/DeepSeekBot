import * as z from 'zod/mini';
import type { GenuiVm } from './genui-vm.js';

const digits = (minimum: number, maximum: number) =>
  z.optional(z.int().check(z.gte(minimum), z.lte(maximum)));
const requestSchema = z.strictObject({
  locale: z.optional(z.string().check(z.maxLength(35), z.regex(/^[a-zA-Z0-9-]+$/u))),
  number: z.number(),
  options: z.optional(
    z.strictObject({
      style: z.optional(z.enum(['decimal', 'percent', 'currency', 'unit'])),
      currency: z.optional(z.string().check(z.regex(/^[A-Z]{3}$/u))),
      currencyDisplay: z.optional(z.enum(['symbol', 'narrowSymbol', 'code', 'name'])),
      currencySign: z.optional(z.enum(['standard', 'accounting'])),
      unit: z.optional(z.string().check(z.maxLength(40), z.regex(/^[a-z-]+$/u))),
      unitDisplay: z.optional(z.enum(['short', 'long', 'narrow'])),
      useGrouping: z.optional(z.boolean()),
      notation: z.optional(z.enum(['standard', 'scientific', 'engineering', 'compact'])),
      compactDisplay: z.optional(z.enum(['short', 'long'])),
      signDisplay: z.optional(z.enum(['auto', 'never', 'always', 'exceptZero'])),
      minimumIntegerDigits: digits(1, 21),
      minimumFractionDigits: digits(0, 20),
      maximumFractionDigits: digits(0, 20),
      minimumSignificantDigits: digits(1, 21),
      maximumSignificantDigits: digits(1, 21),
    }),
  ),
});

export function installGenuiNumberFormat(vm: GenuiVm): () => void {
  const context = vm.context;
  let calls = 0;
  const format = context.newFunction('__genuiFormatNumber', (value) => {
    if (++calls > 100 || context.typeof(value) !== 'string')
      throw Error('Number format budget exceeded.');
    const length = context.getProp(value, 'length');
    try {
      if (context.getNumber(length) > 4096) throw Error('Number format input budget exceeded.');
    } finally {
      length.dispose();
    }
    const request = requestSchema.parse(JSON.parse(context.getString(value)));
    const result = new Intl.NumberFormat(request.locale, request.options).format(request.number);
    if (result.length > 4096) throw Error('Number format output budget exceeded.');
    return context.newString(result);
  });
  context.setProp(context.global, '__genuiFormatNumber', format);
  format.dispose();
  vm.execute(`globalThis.Intl = Object.freeze({ NumberFormat: class {
    constructor(locale, options) { this.locale = locale; this.options = options; }
    format(number) { return __genuiFormatNumber(JSON.stringify({locale:this.locale,options:this.options,number})); }
  } });`);
  return () => {
    calls = 0;
  };
}
