import { describe, expect, it } from 'vitest';

import { modelEffortChoices } from '../src/model-catalog.js';

describe('modelEffortChoices allows every effort by default', () => {
  it('lists the provider default and each effort, keeping the model default', () => {
    expect(
      modelEffortChoices({
        efforts: [
          { id: 'low', name: 'Low' },
          { id: 'high', name: 'High' },
        ],
        defaultEffort: 'high',
      }),
    ).toEqual({ allowedEfforts: ['', 'low', 'high'], defaultEffort: 'high' });
  });

  it('falls back to the provider default when the model has no efforts', () => {
    expect(modelEffortChoices({ defaultEffort: 'max' })).toEqual({
      allowedEfforts: [''],
      defaultEffort: '',
    });
    expect(modelEffortChoices({ efforts: [{ id: '', name: 'Default' }] })).toEqual({
      allowedEfforts: [''],
      defaultEffort: '',
    });
  });
});
