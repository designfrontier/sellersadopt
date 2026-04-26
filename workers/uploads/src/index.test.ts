/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import worker, {
  sanitizeFilename,
  ALLOWED_CONTENT_TYPES,
  MAX_SIZE,
  PRESIGN_EXPIRY_SECONDS,
} from './index';

const ALLOWED_ORIGIN = 'https://sellersadopt.com';
const DISALLOWED_ORIGIN = 'https://evil.example.com';
const VALID_USER = 'designfrontier';
const INVALID_USER = 'malicious-user';

function makeCtx(): ExecutionContext {
  return {
    waitUntil() {},
    passThroughOnException() {},
    props: {},
  } as unknown as ExecutionContext;
}

/**
 * The `Request` constructor in `@cloudflare/workers-types` expects an
 * `IncomingRequestCfProperties` shape on the `cf` property, but tests
 * construct ordinary outbound `Request` objects whose `cf` is the
 * `RequestInitCfProperties` shape. Worker code only reads url/method/
 * headers/body, so this cast is structurally safe.
 */
function callWorker(req: Request): Promise<Response> {
  return worker.fetch(req as unknown as Request, env as unknown as Parameters<typeof worker.fetch>[1], makeCtx());
}

interface MockUserOptions {
  status?: number;
  login?: string;
}

/**
 * Stub global fetch so api.github.com/user returns a known login.
 * The R2 endpoint is *never* fetched in production code path — aws4fetch
 * `sign()` only constructs a Request, it does not send it. So this stub
 * is safe even though it would otherwise affect any other outbound call.
 */
function stubGitHub({ status = 200, login = VALID_USER }: MockUserOptions = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith('https://api.github.com/user')) {
        if (status !== 200) {
          return new Response('{"message":"Bad credentials"}', {
            status,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ login }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch in test: ${url}`);
    }),
  );
}

function presignRequest(body: unknown, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('Origin')) {
    headers.set('Origin', ALLOWED_ORIGIN);
  }
  if (!headers.has('Authorization')) {
    headers.set('Authorization', 'Bearer fake-token');
  }
  return new Request('https://uploads.sellersadopt.com/presign', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
    // Override after spread to ensure our headers + body win.
  });
}

describe('sanitizeFilename', () => {
  it('lowercases and replaces unsafe characters', () => {
    expect(sanitizeFilename('My Photo (1).JPG')).toBe('my-photo-1.jpg');
  });
  it('collapses runs of dashes (but underscores survive)', () => {
    // spaces become '-' which collapses; underscores are preserved.
    expect(sanitizeFilename('a    b____c.png')).toBe('a-b____c.png');
    expect(sanitizeFilename('foo!!!bar???.png')).toBe('foo-bar.png');
  });
  it('preserves dots, underscores, dashes', () => {
    expect(sanitizeFilename('img_2024-01-01.test.webp')).toBe('img_2024-01-01.test.webp');
  });
  it('returns empty string for nothing-but-junk', () => {
    expect(sanitizeFilename('!!!')).toBe('');
    expect(sanitizeFilename('   ')).toBe('');
  });
  it('trims leading/trailing dashes and dots', () => {
    expect(sanitizeFilename('---hello---.jpg---')).toBe('hello.jpg');
  });
});

describe('OPTIONS preflight', () => {
  it('returns 204 with CORS headers for an allowed origin', async () => {
    const req = new Request('https://uploads.sellersadopt.com/presign', {
      method: 'OPTIONS',
      headers: { Origin: ALLOWED_ORIGIN },
    });
    const res = await callWorker(req);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Authorization, Content-Type');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('returns 204 with no Access-Control-Allow-Origin for a disallowed origin', async () => {
    const req = new Request('https://uploads.sellersadopt.com/presign', {
      method: 'OPTIONS',
      headers: { Origin: DISALLOWED_ORIGIN },
    });
    const res = await callWorker(req);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    // Vary: Origin is still set so caches don't poison cross-origin entries.
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('returns 204 with no CORS headers when no Origin sent', async () => {
    const req = new Request('https://uploads.sellersadopt.com/presign', {
      method: 'OPTIONS',
    });
    const res = await callWorker(req);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('POST /presign', () => {
  beforeEach(() => {
    stubGitHub();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a signed URL on valid input', async () => {
    const req = presignRequest({
      filename: 'My Photo (1).JPG',
      contentType: 'image/jpeg',
      size: 1234,
    });
    const res = await callWorker(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { uploadUrl: string; publicUrl: string; key: string };
    expect(json.key).toMatch(/^\d{4}\/\d{2}\/\d+-my-photo-1\.jpg$/);
    expect(json.publicUrl).toBe(`https://uploads.sellersadopt.com/${json.key.split('/').map(encodeURIComponent).join('/')}`);
    expect(json.uploadUrl).toContain('.r2.cloudflarestorage.com/');
    const u = new URL(json.uploadUrl);
    expect(u.searchParams.get('X-Amz-Signature')).toBeTruthy();
    expect(u.searchParams.get('X-Amz-Date')).toBeTruthy();
    expect(u.searchParams.get('X-Amz-Expires')).toBe(String(PRESIGN_EXPIRY_SECONDS));
    expect(u.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    // CORS headers carried through on the success response too.
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
  });

  it('returns 401 when Authorization is missing', async () => {
    const req = presignRequest(
      { filename: 'x.jpg', contentType: 'image/jpeg', size: 10 },
      { headers: { 'Content-Type': 'application/json', Origin: ALLOWED_ORIGIN } },
    );
    // remove Authorization header
    const noAuth = new Request(req, { headers: new Headers({
      'Content-Type': 'application/json',
      Origin: ALLOWED_ORIGIN,
    })});
    const res = await callWorker(noAuth);
    expect(res.status).toBe(401);
  });

  it('returns 401 when Authorization is malformed (no Bearer)', async () => {
    const req = presignRequest(
      { filename: 'x.jpg', contentType: 'image/jpeg', size: 10 },
      { headers: { Authorization: 'Basic abc', Origin: ALLOWED_ORIGIN, 'Content-Type': 'application/json' } },
    );
    const res = await callWorker(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when GitHub rejects the token', async () => {
    vi.unstubAllGlobals();
    stubGitHub({ status: 401 });
    const req = presignRequest({ filename: 'x.jpg', contentType: 'image/jpeg', size: 10 });
    const res = await callWorker(req);
    expect(res.status).toBe(401);
  });

  it('returns 403 when the GitHub user is not in the allowlist', async () => {
    vi.unstubAllGlobals();
    stubGitHub({ login: INVALID_USER });
    const req = presignRequest({ filename: 'x.jpg', contentType: 'image/jpeg', size: 10 });
    const res = await callWorker(req);
    expect(res.status).toBe(403);
  });

  it('matches the GitHub user case-insensitively', async () => {
    vi.unstubAllGlobals();
    stubGitHub({ login: 'DesignFrontier' });
    const req = presignRequest({ filename: 'x.jpg', contentType: 'image/jpeg', size: 10 });
    const res = await callWorker(req);
    expect(res.status).toBe(200);
  });

  it('returns 400 for a disallowed contentType', async () => {
    const req = presignRequest({
      filename: 'doc.pdf',
      contentType: 'application/pdf',
      size: 100,
    });
    const res = await callWorker(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('contentType');
  });

  it('returns 400 when size exceeds MAX_SIZE', async () => {
    const req = presignRequest({
      filename: 'big.jpg',
      contentType: 'image/jpeg',
      size: MAX_SIZE + 1,
    });
    const res = await callWorker(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when size is negative', async () => {
    const req = presignRequest({
      filename: 'x.jpg',
      contentType: 'image/jpeg',
      size: -5,
    });
    const res = await callWorker(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when size is not a number', async () => {
    const req = presignRequest({
      filename: 'x.jpg',
      contentType: 'image/jpeg',
      size: 'lots' as unknown as number,
    });
    const res = await callWorker(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 for malformed JSON body', async () => {
    const req = presignRequest('{not valid json');
    const res = await callWorker(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when JSON body is not an object', async () => {
    const req = presignRequest('"a string"');
    const res = await callWorker(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when filename is missing', async () => {
    const req = presignRequest({
      contentType: 'image/jpeg',
      size: 10,
    });
    const res = await callWorker(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when sanitized filename is empty', async () => {
    const req = presignRequest({
      filename: '!!!',
      contentType: 'image/jpeg',
      size: 10,
    });
    const res = await callWorker(req);
    expect(res.status).toBe(400);
  });

  it('accepts every allowed contentType', async () => {
    for (const ct of ALLOWED_CONTENT_TYPES) {
      const req = presignRequest({ filename: 'a.bin', contentType: ct, size: 1 });
      const res = await callWorker(req);
      expect(res.status).toBe(200);
    }
  });
});

describe('routing', () => {
  it('returns 404 for unknown paths', async () => {
    const req = new Request('https://uploads.sellersadopt.com/whatever', {
      method: 'GET',
      headers: { Origin: ALLOWED_ORIGIN },
    });
    const res = await callWorker(req);
    expect(res.status).toBe(404);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
  });

  it('returns 404 for POST on unknown path', async () => {
    const req = new Request('https://uploads.sellersadopt.com/other', {
      method: 'POST',
      headers: { Origin: ALLOWED_ORIGIN, Authorization: 'Bearer x' },
    });
    const res = await callWorker(req);
    expect(res.status).toBe(404);
  });
});
