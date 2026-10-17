export function cloudNativeIntent(path: string): string {
  return /^ai\.botharness\.deepseekbot\.dev:/i.test(path) ? '/cloud-services' : path;
}
