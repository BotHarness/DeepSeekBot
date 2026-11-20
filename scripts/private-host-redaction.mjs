export function createPrivateHostRedactor(url) {
  const parsed = new URL(url);
  const secrets = [parsed.searchParams.get('token'), parsed.hash.slice(1)].filter(Boolean);
  return (value) => {
    let text = String(value).replaceAll(url, '[private Host URL]');
    for (const secret of secrets) text = text.replaceAll(secret, '[redacted]');
    return text;
  };
}
