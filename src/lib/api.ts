/** Same-origin JSON client. Never logs requests or responses. */
export class ApiFailure extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiFailure';
  }
}

const OFFLINE_MESSAGE = 'You appear to be offline. Reading still works; this will be available when you reconnect.';

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'X-Dusk-Client': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiFailure(0, 'offline', OFFLINE_MESSAGE);
  }
  let data: unknown = undefined;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } & Record<string, unknown> } | undefined)?.error;
    if (!err) {
      throw new ApiFailure(res.status, res.status === 404 ? 'not_deployed' : 'server', res.status === 404
        ? 'Accounts and discussions are not available on this deployment yet. Reading is unaffected.'
        : 'The server could not complete that request. Please try again shortly.');
    }
    const { code = 'server', message = 'The server could not complete that request.', ...extra } = err;
    throw new ApiFailure(res.status, code, message, extra);
  }
  return data as T;
}
