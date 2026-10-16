const Module = require('node:module');
const original = Module._load;
const react = require('react');
const native = {
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  Platform: { OS: 'ios', select: (values) => values.ios ?? values.default },
  Dimensions: {
    get: () => ({ width: 390, height: 844 }),
    addEventListener: () => ({ remove() {} }),
  },
  StyleSheet: { create: (styles) => styles },
};
Module._load = function (name, ...args) {
  if (name === 'react-native') return native;
  if (name === 'react-native-safe-area-context') return { SafeAreaProvider: react.Fragment };
  if (name === 'react-native-svg') return {};
  return original.call(this, name, ...args);
};
module.exports.restore = () => {
  Module._load = original;
};
