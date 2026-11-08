import { z } from 'zod';
import type { GenuiVm } from './genui-vm.js';

const requestSchema = z.strictObject({
  locale: z
    .string()
    .max(35)
    .regex(/^[a-zA-Z0-9-]+$/u)
    .optional(),
  number: z.number().finite(),
  options: z
    .strictObject({
      style: z.enum(['decimal', 'percent', 'currency', 'unit']).optional(),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/u)
        .optional(),
      currencyDisplay: z.enum(['symbol', 'narrowSymbol', 'code', 'name']).optional(),
      currencySign: z.enum(['standard', 'accounting']).optional(),
      unit: z
        .string()
        .max(40)
        .regex(/^[a-z-]+$/u)
        .optional(),
      unitDisplay: z.enum(['short', 'long', 'narrow']).optional(),
      useGrouping: z.boolean().optional(),
      notation: z.enum(['standard', 'scientific', 'engineering', 'compact']).optional(),
      compactDisplay: z.enum(['short', 'long']).optional(),
      signDisplay: z.enum(['auto', 'never', 'always', 'exceptZero']).optional(),
      minimumIntegerDigits: z.number().int().min(1).max(21).optional(),
      minimumFractionDigits: z.number().int().min(0).max(20).optional(),
      maximumFractionDigits: z.number().int().min(0).max(20).optional(),
      minimumSignificantDigits: z.number().int().min(1).max(21).optional(),
      maximumSignificantDigits: z.number().int().min(1).max(21).optional(),
    })
    .optional(),
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
