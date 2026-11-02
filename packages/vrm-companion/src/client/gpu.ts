const SOFTWARE = /swiftshader|llvmpipe|softpipe|basic render|software|lavapipe/i;

export function isSoftwareRenderer(name: string) {
  return SOFTWARE.test(name);
}

const probe = (attributes: WebGLContextAttributes) => {
  const gl = document.createElement('canvas').getContext('webgl2', attributes);
  if (!gl) return undefined;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(
    info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
  );
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return name;
};

let checked: { software: boolean } | undefined;

export function softwareRendering() {
  if (checked) return checked.software;
  const fast = probe({ failIfMajorPerformanceCaveat: true });
  const any = fast ?? probe({});
  checked = { software: any !== undefined && (fast === undefined || isSoftwareRenderer(fast)) };
  return checked.software;
}
