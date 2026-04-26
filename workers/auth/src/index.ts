/**
 * GitHub OAuth callback Worker for Sveltia / Decap CMS.
 *
 * Implements the popup-window OAuth handshake required by Decap-compatible
 * CMSes. The CMS opens this Worker at `/auth?provider=github&...`; we redirect
 * to GitHub, receive the code at `/callback`, exchange it for an access token,
 * verify the user is on the allowlist, and post the token back to the opener
 * via `window.opener.postMessage`.
 *
 * The Decap/Sveltia message format is non-negotiable:
 *   `authorization:github:success:{"token":"...","provider":"github"}`
 *   `authorization:github:error:<json>`
 */

export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** Comma-separated list of allowed GitHub login names. */
  ALLOWED_GITHUB_USERS: string;
}

const STATE_COOKIE = "__sellers_oauth_state";
const STATE_COOKIE_MAX_AGE_SECONDS = 600; // 10 minutes
const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const USER_AGENT = "sellers-auth-worker";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/auth") {
      return handleAuth(request, env);
    }

    if (request.method === "GET" && url.pathname === "/callback") {
      return handleCallback(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },
};

async function handleAuth(request: Request, env: Env): Promise<Response> {
  const requestUrl = new URL(request.url);
  const state = generateState();
  const redirectUri = `${requestUrl.origin}/callback`;

  const authorize = new URL(GITHUB_AUTHORIZE_URL);
  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", "repo");
  authorize.searchParams.set("state", state);

  const headers = new Headers();
  headers.set("Location", authorize.toString());
  headers.append(
    "Set-Cookie",
    [
      `${STATE_COOKIE}=${state}`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      `Max-Age=${STATE_COOKIE_MAX_AGE_SECONDS}`,
    ].join("; ")
  );

  return new Response(null, { status: 302, headers });
}

async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieState = readCookie(request.headers.get("cookie"), STATE_COOKIE);

  if (!state || !cookieState || state !== cookieState) {
    return textResponse(400, "State mismatch");
  }

  if (!code) {
    return textResponse(400, "Missing code");
  }

  const redirectUri = `${url.origin}/callback`;

  let tokenJson: TokenResponse;
  try {
    tokenJson = await exchangeCode(env, code, redirectUri);
  } catch (err) {
    const message = err instanceof Error ? err.message : "token_exchange_failed";
    return errorPage(500, { message });
  }

  if (!tokenJson.access_token) {
    return errorPage(
      200,
      tokenJson.error
        ? {
            error: tokenJson.error,
            error_description: tokenJson.error_description,
          }
        : { message: "No access_token in GitHub response" }
    );
  }

  let login: string;
  try {
    login = await fetchLogin(tokenJson.access_token);
  } catch (err) {
    const message = err instanceof Error ? err.message : "user_lookup_failed";
    return errorPage(500, { message });
  }

  if (!isAllowed(login, env.ALLOWED_GITHUB_USERS)) {
    return errorPage(403, { message: "User not authorized" });
  }

  return successPage(tokenJson.access_token);
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function exchangeCode(
  env: Env,
  code: string,
  redirectUri: string
): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.set("client_id", env.GITHUB_CLIENT_ID);
  body.set("client_secret", env.GITHUB_CLIENT_SECRET);
  body.set("code", code);
  body.set("redirect_uri", redirectUri);

  const res = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`GitHub token endpoint returned ${res.status}`);
  }

  return (await res.json()) as TokenResponse;
}

async function fetchLogin(token: string): Promise<string> {
  const res = await fetch(GITHUB_USER_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": USER_AGENT,
      Accept: "application/vnd.github+json",
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub user endpoint returned ${res.status}`);
  }

  const data = (await res.json()) as { login?: string };
  if (!data.login) {
    throw new Error("GitHub user response missing login");
  }
  return data.login;
}

function isAllowed(login: string, allowlist: string): boolean {
  if (!allowlist) return false;
  const target = login.trim().toLowerCase();
  if (!target) return false;
  return allowlist
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0)
    .includes(target);
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  const parts = header.split(/;\s*/);
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}

function generateState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function textResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

// Built via `new RegExp` so the source file does not contain raw U+2028 /
// U+2029 — esbuild rejects those inside regex literals.
const LS_RE = new RegExp(String.fromCharCode(0x2028), "g");
const PS_RE = new RegExp(String.fromCharCode(0x2029), "g");

/**
 * Escape a string so it's safe to embed inside a single-quoted JS string in an
 * inline `<script>` block. We must guard against:
 *   - `\` (escape character)
 *   - `'` (closes our string literal)
 *   - `<` (could open `</script>` and break out of the script tag)
 *   - line terminators that JS treats as string-terminators
 *   - Unicode line/paragraph separators that also break JS strings
 */
function escapeForJsString(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/</g, "\\u003c")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(LS_RE, "\\u2028")
    .replace(PS_RE, "\\u2029");
}

function buildPostMessageHtml(payload: string, title: string): string {
  const safe = escapeForJsString(payload);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
</head>
<body>
<p>${title}. You can close this window.</p>
<script>
(function () {
  var msg = '${safe}';
  if (window.opener) {
    window.opener.postMessage(msg, '*');
    window.close();
  }
})();
</script>
</body>
</html>`;
}

function successPage(token: string): Response {
  const payload =
    "authorization:github:success:" +
    JSON.stringify({ token, provider: "github" });
  const html = buildPostMessageHtml(payload, "Authorization successful");
  const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
  // Clear the state cookie now that we're done with it.
  headers.append(
    "Set-Cookie",
    `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
  return new Response(html, { status: 200, headers });
}

function errorPage(status: number, errorObj: unknown): Response {
  const payload =
    "authorization:github:error:" + JSON.stringify(errorObj ?? {});
  const html = buildPostMessageHtml(payload, "Authorization failed");
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
