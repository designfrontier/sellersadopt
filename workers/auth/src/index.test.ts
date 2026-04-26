import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "./index";

const BASE_URL = "https://auth.sellersadopt.com";

const baseEnv: Env = {
  GITHUB_CLIENT_ID: "test_client_id",
  GITHUB_CLIENT_SECRET: "test_client_secret",
  ALLOWED_GITHUB_USERS: "DanielSellers, katiesellers",
};

type FetchMock = ReturnType<typeof vi.fn>;

function makeRequest(
  pathAndQuery: string,
  init: RequestInit = {}
): Request {
  return new Request(`${BASE_URL}${pathAndQuery}`, init);
}

async function callWorker(req: Request, env: Env = baseEnv): Promise<Response> {
  return worker.fetch(req, env);
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

/**
 * Build a fetch mock that maps the GitHub URLs we hit to canned responses.
 * Anything not matched throws so the test fails loudly.
 */
function mockGithub(handlers: {
  token?: () => Response | Promise<Response>;
  user?: () => Response | Promise<Response>;
}): FetchMock {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url.startsWith("https://github.com/login/oauth/access_token")) {
      if (!handlers.token) throw new Error("token handler not provided");
      return handlers.token();
    }
    if (url.startsWith("https://api.github.com/user")) {
      if (!handlers.user) throw new Error("user handler not provided");
      return handlers.user();
    }
    throw new Error(`Unexpected fetch to ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn as unknown as FetchMock;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GET /auth", () => {
  it("redirects to GitHub authorize with required params and sets state cookie", async () => {
    const res = await callWorker(makeRequest("/auth?provider=github&site_id=x&scope=repo"));

    expect(res.status).toBe(302);

    const location = res.headers.get("Location");
    expect(location).toBeTruthy();
    const loc = new URL(location!);
    expect(loc.origin + loc.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(loc.searchParams.get("client_id")).toBe("test_client_id");
    expect(loc.searchParams.get("redirect_uri")).toBe(`${BASE_URL}/callback`);
    expect(loc.searchParams.get("scope")).toBe("repo");
    const state = loc.searchParams.get("state");
    expect(state).toMatch(/^[0-9a-f]{32}$/);

    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain(`__sellers_oauth_state=${state}`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toMatch(/Max-Age=600/);
  });
});

describe("GET /callback", () => {
  it("returns 200 HTML with success postMessage when user is allowed", async () => {
    const fetchMock = mockGithub({
      token: () => jsonResponse({ access_token: "gho_test_token", token_type: "bearer", scope: "repo" }),
      user: () => jsonResponse({ login: "danielsellers" }),
    });

    const res = await callWorker(
      makeRequest("/callback?code=abc123&state=deadbeef", {
        headers: { cookie: "__sellers_oauth_state=deadbeef" },
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");

    const body = await res.text();
    expect(body).toContain(
      `authorization:github:success:${JSON.stringify({ token: "gho_test_token", provider: "github" })}`
    );
    expect(body).toContain("window.opener.postMessage");

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const tokenCall = fetchMock.mock.calls[0];
    expect(tokenCall[0]).toBe("https://github.com/login/oauth/access_token");
    const tokenInit = tokenCall[1] as RequestInit;
    expect(tokenInit.method).toBe("POST");
    const headers = new Headers(tokenInit.headers as HeadersInit);
    expect(headers.get("Accept")).toBe("application/json");
    const body2 = new URLSearchParams(tokenInit.body as string);
    expect(body2.get("client_id")).toBe("test_client_id");
    expect(body2.get("client_secret")).toBe("test_client_secret");
    expect(body2.get("code")).toBe("abc123");
    expect(body2.get("redirect_uri")).toBe(`${BASE_URL}/callback`);

    const userCall = fetchMock.mock.calls[1];
    expect(userCall[0]).toBe("https://api.github.com/user");
    const userInit = userCall[1] as RequestInit;
    const uHeaders = new Headers(userInit.headers as HeadersInit);
    expect(uHeaders.get("Authorization")).toBe("Bearer gho_test_token");
    expect(uHeaders.get("User-Agent")).toBe("sellers-auth-worker");
  });

  it("returns 403 with error postMessage when user is not on the allowlist", async () => {
    mockGithub({
      token: () => jsonResponse({ access_token: "gho_intruder", token_type: "bearer" }),
      user: () => jsonResponse({ login: "octocat" }),
    });

    const res = await callWorker(
      makeRequest("/callback?code=abc123&state=s1", {
        headers: { cookie: "__sellers_oauth_state=s1" },
      })
    );

    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).toContain('authorization:github:error:{"message":"User not authorized"}');
  });

  it("returns 400 when state does not match the cookie", async () => {
    const fetchMock = mockGithub({});

    const res = await callWorker(
      makeRequest("/callback?code=abc&state=mismatch", {
        headers: { cookie: "__sellers_oauth_state=other" },
      })
    );

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 when state cookie is missing entirely", async () => {
    const res = await callWorker(makeRequest("/callback?code=abc&state=s1"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when code is missing", async () => {
    const res = await callWorker(
      makeRequest("/callback?state=s1", {
        headers: { cookie: "__sellers_oauth_state=s1" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns error postMessage page when GitHub responds with an OAuth error", async () => {
    mockGithub({
      token: () =>
        jsonResponse({
          error: "bad_verification_code",
          error_description: "The code passed is incorrect or expired.",
        }),
    });

    const res = await callWorker(
      makeRequest("/callback?code=abc&state=s1", {
        headers: { cookie: "__sellers_oauth_state=s1" },
      })
    );

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("authorization:github:error:");
    expect(body).toContain("bad_verification_code");
  });

  it("returns error postMessage when token endpoint returns no access_token and no error", async () => {
    mockGithub({
      token: () => jsonResponse({ scope: "" }),
    });

    const res = await callWorker(
      makeRequest("/callback?code=abc&state=s1", {
        headers: { cookie: "__sellers_oauth_state=s1" },
      })
    );

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("authorization:github:error:");
    expect(body).toContain("No access_token");
  });

  it("returns 500 error page when token endpoint is non-2xx", async () => {
    mockGithub({
      token: () => new Response("server error", { status: 500 }),
    });

    const res = await callWorker(
      makeRequest("/callback?code=abc&state=s1", {
        headers: { cookie: "__sellers_oauth_state=s1" },
      })
    );

    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).toContain("authorization:github:error:");
    expect(body).toContain("GitHub token endpoint returned 500");
  });

  it("returns 500 error page when GitHub user endpoint fails", async () => {
    mockGithub({
      token: () => jsonResponse({ access_token: "gho_x" }),
      user: () => new Response("nope", { status: 401 }),
    });

    const res = await callWorker(
      makeRequest("/callback?code=abc&state=s1", {
        headers: { cookie: "__sellers_oauth_state=s1" },
      })
    );

    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).toContain("GitHub user endpoint returned 401");
  });

  it("returns 500 error page when user response has no login", async () => {
    mockGithub({
      token: () => jsonResponse({ access_token: "gho_x" }),
      user: () => jsonResponse({ id: 42 }),
    });

    const res = await callWorker(
      makeRequest("/callback?code=abc&state=s1", {
        headers: { cookie: "__sellers_oauth_state=s1" },
      })
    );

    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).toContain("login");
  });

  it("rejects everyone when ALLOWED_GITHUB_USERS is empty", async () => {
    mockGithub({
      token: () => jsonResponse({ access_token: "gho_x" }),
      user: () => jsonResponse({ login: "danielsellers" }),
    });

    const res = await callWorker(
      makeRequest("/callback?code=abc&state=s1", {
        headers: { cookie: "__sellers_oauth_state=s1" },
      }),
      { ...baseEnv, ALLOWED_GITHUB_USERS: "" }
    );
    expect(res.status).toBe(403);
  });

  it("escapes dangerous characters in the success payload", async () => {
    mockGithub({
      // A pathological token (not actually possible from GitHub, but defensive).
      token: () => jsonResponse({ access_token: "gho_</script><x'\\" }),
      user: () => jsonResponse({ login: "danielsellers" }),
    });

    const res = await callWorker(
      makeRequest("/callback?code=abc&state=s1", {
        headers: { cookie: "__sellers_oauth_state=s1" },
      })
    );

    expect(res.status).toBe(200);
    const body = await res.text();
    // Raw `</script>` must not appear inside the script body.
    const scriptOpenIdx = body.indexOf("<script>");
    const scriptCloseIdx = body.indexOf("</script>");
    expect(scriptOpenIdx).toBeGreaterThan(-1);
    expect(scriptCloseIdx).toBeGreaterThan(scriptOpenIdx);
    const scriptBody = body.slice(scriptOpenIdx + "<script>".length, scriptCloseIdx);
    expect(scriptBody).not.toContain("</script>");
    // The unescaped single quote in the token must not appear bare in the JS string.
    // We require it to be escaped (`\'`).
    expect(scriptBody).toContain("\\'");
  });
});

describe("unknown routes", () => {
  it("returns 404 for unmatched paths", async () => {
    const res = await callWorker(makeRequest("/nope"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for non-GET methods on /auth", async () => {
    const res = await callWorker(makeRequest("/auth", { method: "POST" }));
    expect(res.status).toBe(404);
  });
});
