declare const require: { async(spec: string): Promise<{ url: string }> };

export async function defaultModel(): Promise<string> {
  return (await require.async('./client.model.js')).url;
}
