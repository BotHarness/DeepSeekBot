window.renderFrame = renderFrame; window.TOTAL = END; window.EVENTS = EVENTS;
window.ready = Promise.all(['400', '500', '600', '700', '800'].flatMap(w => [document.fonts.load(`${w} 40px Geist`), document.fonts.load(`${w} 40px GeistMono`)]))
  .then(() => document.fonts.ready).then(() => buildAll());
