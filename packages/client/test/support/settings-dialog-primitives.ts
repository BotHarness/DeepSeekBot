type SettingsDialogPrimitives = ReturnType<
  typeof import('../primitive-mocks.js').comboboxPrimitives
>;

export const mockSettingsDialogPrimitives = async (): Promise<SettingsDialogPrimitives> => ({
  ...(await import('../primitive-mocks.js')).shellPrimitives(),
  ...(await import('../primitive-mocks.js')).comboboxPrimitives(),
  ...(await import('../primitive-mocks.js')).dialogPrimitives(),
});
