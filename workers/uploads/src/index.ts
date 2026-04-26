import { AwsClient } from 'aws4fetch';

export interface Env {
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_ACCOUNT_ID: string;
  R2_BUCKET: string;
  ALLOWED_GITHUB_USERS: string;
  PUBLIC_BASE_URL: string;
  ALLOWED_ORIGINS: string;
}

export const MAX_SIZE = 25 * 1024 * 1024;
export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;
export const PRESIGN_EXPIRY_SECONDS = 300;

interface PresignBody {
  filename: string;
  contentType: string;
  size: number;
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function corsHeadersFor(origin: string | null, env: Env): Headers {
  const headers = new Headers();
  const allowedOrigins = parseList(env.ALLOWED_ORIGINS);
  headers.set('Vary', 'Origin');
  if (origin && allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return headers;
}

function jsonResponse(
  status: number,
  body: unknown,
  cors: Headers,
): Response {
  const headers = new Headers(cors);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Sanitize a user-supplied filename:
 *   - lowercase the entire string
 *   - replace every char NOT in [a-z0-9._-] with '-'
 *   - collapse runs of '-'
 *   - trim leading/trailing '-' and '.'
 *
 * Examples:
 *   "My Photo (1).JPG" -> "my-photo-1-.jpg" -> collapse -> "my-photo-1-.jpg"
 *     wait: '(' -> '-', ')' -> '-', ' ' -> '-' so we get
 *     "my-photo--1-.jpg" -> collapsed to "my-photo-1-.jpg"
 *     then we don't trim internal '-' before '.', so result is
 *     "my-photo-1-.jpg" — ugly. To avoid trailing '-' before the
 *     extension dot, also collapse '-.' sequences to '.'.
 */
export function sanitizeFilename(input: string): string {
  let s = input.toLowerCase();
  s = s.replace(/[^a-z0-9._-]/g, '-');
  s = s.replace(/-+/g, '-');
  // collapse "-." runs to "." so "my-photo-.jpg" becomes "my-photo.jpg"
  s = s.replace(/-+\./g, '.');
  // collapse ".-" runs to "." too, for symmetry
  s = s.replace(/\.-+/g, '.');
  // collapse repeated dots
  s = s.replace(/\.+/g, '.');
  // trim leading/trailing '-' and '.'
  s = s.replace(/^[-.]+/, '').replace(/[-.]+$/, '');
  return s;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function buildKey(now: Date, sanitized: string): string {
  const yyyy = now.getUTCFullYear();
  const mm = pad2(now.getUTCMonth() + 1);
  const ts = Math.floor(now.getTime() / 1000);
  return `${yyyy}/${mm}/${ts}-${sanitized}`;
}

/**
 * aws4fetch's signQuery datetime format is the AWS basic ISO 8601:
 *   YYYYMMDDTHHMMSSZ
 */
function awsDatetime(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

async function verifyGitHubUser(
  token: string,
  allowed: string[],
): Promise<{ ok: true; login: string } | { ok: false; status: 401 | 403 }> {
  const ghResp = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'sellers-uploads-worker',
      Accept: 'application/vnd.github+json',
    },
  });
  if (ghResp.status !== 200) {
    return { ok: false, status: 401 };
  }
  let user: unknown;
  try {
    user = await ghResp.json();
  } catch {
    return { ok: false, status: 401 };
  }
  const login =
    typeof user === 'object' &&
    user !== null &&
    'login' in user &&
    typeof (user as { login: unknown }).login === 'string'
      ? ((user as { login: string }).login)
      : '';
  if (!login) return { ok: false, status: 401 };
  const allowedLower = allowed.map((u) => u.toLowerCase());
  if (!allowedLower.includes(login.toLowerCase())) {
    return { ok: false, status: 403 };
  }
  return { ok: true, login };
}

async function handlePresign(
  request: Request,
  env: Env,
  cors: Headers,
): Promise<Response> {
  // Auth header
  const authHeader = request.headers.get('Authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!m) {
    return jsonResponse(401, { error: 'Missing or malformed Authorization header' }, cors);
  }
  const token = m[1]!.trim();
  if (!token) {
    return jsonResponse(401, { error: 'Missing or malformed Authorization header' }, cors);
  }

  const allowed = parseList(env.ALLOWED_GITHUB_USERS);
  const verify = await verifyGitHubUser(token, allowed);
  if (!verify.ok) {
    const message = verify.status === 401 ? 'Invalid GitHub token' : 'GitHub user not allowed';
    return jsonResponse(verify.status, { error: message }, cors);
  }

  // Parse body
  let body: PresignBody;
  try {
    const raw = await request.json();
    if (typeof raw !== 'object' || raw === null) {
      return jsonResponse(400, { error: 'Invalid JSON body' }, cors);
    }
    body = raw as PresignBody;
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' }, cors);
  }

  const { filename, contentType, size } = body;

  if (typeof contentType !== 'string' ||
      !(ALLOWED_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    return jsonResponse(400, {
      error: `contentType must be one of: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
    }, cors);
  }

  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0 || size > MAX_SIZE) {
    return jsonResponse(400, {
      error: `size must be a finite number between 0 and ${MAX_SIZE} bytes`,
    }, cors);
  }

  if (typeof filename !== 'string' || filename.length === 0) {
    return jsonResponse(400, { error: 'filename is required' }, cors);
  }

  const sanitized = sanitizeFilename(filename);
  if (sanitized.length === 0) {
    return jsonResponse(400, { error: 'filename is empty after sanitization' }, cors);
  }

  const now = new Date();
  const key = buildKey(now, sanitized);

  const accountId = env.R2_ACCOUNT_ID;
  const bucket = env.R2_BUCKET;
  if (!accountId || !bucket) {
    return jsonResponse(500, { error: 'R2 not configured' }, cors);
  }

  // Build R2 endpoint URL. We percent-encode each path segment of the key
  // so that the slashes in YYYY/MM/... are preserved as path separators
  // (which is what S3/R2 expects), but other special characters in the
  // sanitized filename are escaped if any survive sanitization.
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  const endpoint = new URL(
    `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodedKey}`,
  );
  // Set X-Amz-Expires *on the URL* so aws4fetch's "default to 86400 if not
  // present" branch is skipped and our 300s value sticks.
  endpoint.searchParams.set('X-Amz-Expires', String(PRESIGN_EXPIRY_SECONDS));

  const aws = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });

  const signed = await aws.sign(endpoint.toString(), {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    aws: {
      signQuery: true,
      datetime: awsDatetime(now),
    },
  });

  const uploadUrl = signed.url;
  const publicUrl = `${env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/${encodedKey}`;

  return jsonResponse(200, { uploadUrl, publicUrl, key }, cors);
}

const worker = {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get('Origin');
    const cors = corsHeadersFor(origin, env);

    if (request.method === 'OPTIONS') {
      // Always return 204 for preflight. CORS headers are populated only
      // when the origin is allowed; disallowed origins simply receive 204
      // without any Access-Control-Allow-* headers (browsers will then
      // block the actual request).
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/presign') {
      try {
        return await handlePresign(request, env, cors);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return jsonResponse(500, { error: message }, cors);
      }
    }

    return jsonResponse(404, { error: 'Not found' }, cors);
  },
};

export default worker satisfies ExportedHandler<Env>;
