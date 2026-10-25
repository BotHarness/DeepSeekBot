export function feedbackView(reportId: string): Response {
  const nonce = crypto.randomUUID();
  const path = `/feedback/${reportId}`;
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Message feedback</title><h1>Message feedback</h1><p>Reference: ${reportId}</p>
<form id="access"><label>Maintainer access token <input id="token" type="password" autocomplete="off" required></label><button>View report</button></form>
<p id="status" role="status"></p><pre id="report"></pre><button id="download" hidden>Download diagnostic evidence</button>
<script nonce="${nonce}">
const status = document.getElementById('status');
const request = (suffix) => fetch(${JSON.stringify(path)} + suffix, {headers: {Authorization: 'Bearer ' + document.getElementById('token').value}, cache: 'no-store'});
document.getElementById('access').addEventListener('submit', async (event) => {
  event.preventDefault(); status.textContent = 'Loading…';
  document.getElementById('report').textContent = ''; document.getElementById('download').hidden = true;
  try { const response = await request(''); if (!response.ok) throw new Error();
    document.getElementById('report').textContent = JSON.stringify(await response.json(), null, 2);
    document.getElementById('download').hidden = false; status.textContent = 'Report available';
  } catch { status.textContent = 'Access denied, report expired, or service unavailable.'; }
});
document.getElementById('download').addEventListener('click', async () => {
  try { const response = await request('/archive'); if (!response.ok) throw new Error();
    const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a');
    link.href = url; link.download = 'feedback-${reportId}.zip'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { status.textContent = 'Download unavailable.'; }
});
</script></html>`,
    {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
        'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`,
      },
    },
  );
}
