export function createCreationVisibility(active: boolean) {
  let focused = false;
  let generation = 0;
  let armed = false;
  const visible = () => active && focused;
  return {
    focus() {
      focused = true;
      generation++;
    },
    blur() {
      focused = false;
      armed = false;
      generation++;
    },
    appState(nextActive: boolean) {
      active = nextActive;
      if (!active) {
        armed = false;
        generation++;
      }
    },
    arm() {
      armed = visible();
    },
    visible,
    lease() {
      const current = generation;
      return () => visible() && current === generation;
    },
    takeAutoOpen() {
      if (!armed || !visible()) return false;
      armed = false;
      return true;
    },
  };
}
