// Thin fetch wrapper for the Ellery API. Sessions ride on an httpOnly
// cookie, so every call uses same-origin credentials. All functions resolve
// to a normalized { ok, status, ... } object and never throw.

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    return { ok: false, status: 0, error: 'Cannot reach the Ellery server — is it running?' };
  }

  if (options.raw) {
    if (!res.ok) {
      const data = await safeJSON(res);
      return { ok: false, status: res.status, error: data?.error || `Request failed (${res.status}).` };
    }
    return { ok: true, status: res.status, text: await res.text() };
  }

  const data = await safeJSON(res);
  if (!res.ok || data?.ok === false) {
    return {
      ...data,
      ok: false,
      status: res.status,
      error: data?.error || data?.warnings?.[0] || `Request failed (${res.status}).`,
    };
  }
  return { status: res.status, ...data, ok: true };
}

async function safeJSON(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export const api = {
  session: () => request('/api/session'),
  ingest: (raw) => request('/api/ingest', { method: 'POST', body: { raw } }),
  checkoutSandbox: (card) => request('/api/checkout/sandbox', { method: 'POST', body: card }),
  exportStory: (payload) => request('/api/export', { method: 'POST', body: payload, raw: true }),
  sharePreview: (payload) => request('/api/share', { method: 'POST', body: payload, raw: true }),
  exportInteractive: (payload) => request('/api/export/interactive', { method: 'POST', body: payload, raw: true }),
  devReset: () => request('/api/dev/reset', { method: 'POST' }),
};
