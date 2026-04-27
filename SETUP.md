# SETUP.md — Finalize and go live

This document is the complete, ordered checklist Daniel follows once to take
a freshly-built clone of this repo to a fully-working production site at
<https://sellersadopt.com>. Each step unblocks the next — work them in
order.

If you're looking for day-to-day editing instructions, see
[CMS-GUIDE.md](./CMS-GUIDE.md). For the high-level overview, see
[README.md](./README.md). For the auth Worker internals, see
[workers/auth/README.md](./workers/auth/README.md).

---

## Architecture in one paragraph

The static site is built and served by **GitHub Pages** (workflow:
`.github/workflows/deploy-site.yml`). The custom domain `sellersadopt.com`
points at GitHub Pages via Cloudflare DNS. Image uploads from the CMS are
**committed into the git repo** alongside the markdown that references them
— there is no external media storage, and Cloudflare is used purely for
DNS plus the auth Worker. The only Cloudflare Worker in play is
`workers/auth/`, which handles GitHub OAuth for Sveltia at
`auth.sellersadopt.com`.

A note on placeholder syntax in this doc: anywhere you see
`<UPPERCASE_IN_ANGLE_BRACKETS>`, that's a value you (Daniel) need to
substitute in. The full list:

- `<GITHUB_CLIENT_ID_VALUE>` — from step 4
- `<GITHUB_CLIENT_SECRET_VALUE>` — from step 4
- `<CLOUDFLARE_API_TOKEN_VALUE>` — from step 8
- `<CLOUDFLARE_ACCOUNT_ID_VALUE>` — from step 8
- `<KATIE_GITHUB_USERNAME>` — Katie's actual GitHub login. Default
  assumption is `ktbs296-boop`; **confirm with Katie** before pasting it
  into the allowlist.

---

## Table of contents

1. [Prereqs](#1-prereqs)
2. [Enable GitHub Pages](#2-enable-github-pages)
3. [Cloudflare DNS — apex records](#3-cloudflare-dns--apex-records)
4. [Register GitHub OAuth App](#4-register-github-oauth-app)
5. [Auth Worker — set the allowlist](#5-auth-worker--set-the-allowlist)
6. [Auth Worker — set secrets and deploy](#6-auth-worker--set-secrets-and-deploy)
7. [Auth Worker — custom domain](#7-auth-worker--custom-domain)
8. [CI secrets](#8-ci-secrets)
9. [Add Katie as repo collaborator](#9-add-katie-as-repo-collaborator)
10. [First push to main](#10-first-push-to-main)
11. [Verify end-to-end](#11-verify-end-to-end)
12. [Troubleshooting](#troubleshooting)

---

## 1. Prereqs

Before you start, make sure you have:

- A **Cloudflare account** with the `sellersadopt.com` zone active. We use
  Cloudflare for DNS plus the auth Worker — there is no external media
  storage. (Proxy/CDN in front of GitHub Pages is optional; see step 3.)
- A **GitHub account** that owns this repo (`designfrontier/adoption`).
- **Node.js 22+** locally (the site and the auth Worker both target Node 22).
- **Wrangler CLI** installed and authenticated:

  ```sh
  npm install -g wrangler
  wrangler login
  ```

  `wrangler login` opens a browser to your Cloudflare account and stores
  a token in `~/.wrangler/`. Verify with `wrangler whoami` — it should
  print your account name and account ID. (You'll need that account ID
  again in step 8.)

- A **password manager** open. You'll generate several secrets that need
  to live somewhere safe.

---

## 2. Enable GitHub Pages

Do this **before** the first deploy workflow run, otherwise
`actions/configure-pages` errors out with "Get Pages site failed".

1. Repo **Settings** → **Pages** → **Build and deployment**.
2. **Source** = **GitHub Actions** (not "Deploy from a branch").
3. Save.

You don't need to fill in the **Custom domain** field manually — the
`site/public/CNAME` file (already committed, contents `sellersadopt.com`)
tells Pages the custom domain on the first successful deploy. Pages will
auto-populate the field once the artifact lands.

You also don't need to set anything else here yet. The deploy workflow
(`.github/workflows/deploy-site.yml`) already has the right permissions
(`pages: write`, `id-token: write`) and uses the workflow's OIDC token,
so no GitHub-side secrets are needed for the site deploy.

---

## 3. Cloudflare DNS — apex records

Add these records to the `sellersadopt.com` zone in Cloudflare. The four
A records are the required ones; the AAAA records and the `www` CNAME are
optional polish.

**Required — 4× A records on the apex (`@`):**

| Type | Name | Value             |
| ---- | ---- | ----------------- |
| A    | `@`  | `185.199.108.153` |
| A    | `@`  | `185.199.109.153` |
| A    | `@`  | `185.199.110.153` |
| A    | `@`  | `185.199.111.153` |

**Optional — 4× AAAA records on the apex for IPv6:**

| Type | Name | Value                    |
| ---- | ---- | ------------------------ |
| AAAA | `@`  | `2606:50c0:8000::153`    |
| AAAA | `@`  | `2606:50c0:8001::153`    |
| AAAA | `@`  | `2606:50c0:8002::153`    |
| AAAA | `@`  | `2606:50c0:8003::153`    |

**Optional — `www` CNAME:**

| Type  | Name  | Value                       |
| ----- | ----- | --------------------------- |
| CNAME | `www` | `designfrontier.github.io.` |

(Replace `designfrontier` with whatever GitHub username/org owns the repo
if it ever moves.)

### Cloudflare proxy mode

Each record has an orange-cloud / gray-cloud toggle:

- **Orange cloud (proxied):** Cloudflare CDN/DDoS sits in front of GitHub
  Pages. Faster cache for repeat visitors, hides the origin IPs, and gives
  you Cloudflare analytics. **If you proxy, set SSL/TLS mode to "Full"**
  (Cloudflare dashboard → SSL/TLS → Overview). GitHub Pages provisions a
  Let's Encrypt cert for the custom domain on first deploy; that takes a
  few minutes to issue, and "Full" is robust during that window. Once the
  GitHub-issued cert is live you can move to "Full (strict)" for stricter
  validation.
- **Gray cloud (DNS-only):** records resolve straight to GitHub Pages'
  anycast IPs. Simplest path; GitHub handles TLS end-to-end.

Either is fine. Recommendation: start gray-cloud, confirm the site loads
and the cert is healthy, and only then flip to orange + "Full".

### Why `site/public/CNAME` matters

The file at `site/public/CNAME` (already committed, contents
`sellersadopt.com`) is what tells GitHub Pages this is the custom domain.
Astro copies it verbatim into `dist/`, the Pages workflow uploads it as
part of the artifact, and Pages binds the domain on deploy. Don't delete
it.

---

## 4. Register GitHub OAuth App

This is what lets Sveltia authenticate editors via GitHub.

1. Visit <https://github.com/settings/applications/new>.
2. Fill in:

   | Field                       | Value                                      |
   | --------------------------- | ------------------------------------------ |
   | Application name            | `Sellers Adopt CMS`                        |
   | Homepage URL                | `https://sellersadopt.com`                 |
   | Application description     | *(optional — "Adoption site CMS")*         |
   | Authorization callback URL  | `https://auth.sellersadopt.com/callback`   |

   The callback URL **must match exactly** — `https`, no trailing slash,
   no extra path. GitHub will reject the token exchange with
   `redirect_uri_mismatch` otherwise.

3. **Register application.**
4. On the next screen, copy the **Client ID** → save as
   `<GITHUB_CLIENT_ID_VALUE>` in your password manager.
5. Click **Generate a new client secret**. Copy it immediately → save as
   `<GITHUB_CLIENT_SECRET_VALUE>`. You **cannot** view it again later —
   if you lose it, generate a new one.

If you ever transfer the repo to an org, register the OAuth app under the
org instead and grant it access to the repo.

---

## 5. Auth Worker — set the allowlist

The auth Worker rejects logins for any GitHub user not on its allowlist.

Edit `workers/auth/wrangler.toml`. Find the `[vars]` block (currently
`ALLOWED_GITHUB_USERS = ""`) and set it:

```toml
[vars]
ALLOWED_GITHUB_USERS = "designfrontier,<KATIE_GITHUB_USERNAME>"
```

Default assumption: `<KATIE_GITHUB_USERNAME>` is `ktbs296-boop`. **Confirm
with Katie** that this is her actual GitHub login (the URL slug at
`github.com/<login>` — display names don't count) before saving.

The value is comma-separated, case-insensitive at runtime, and trimmed of
whitespace. Don't quote individual usernames.

You can either commit this change now and let CI redeploy it (after step 8
is done) or hold off and commit at step 10. Either works.

---

## 6. Auth Worker — set secrets and deploy

This is a manual one-time deploy that gets the auth Worker reachable on
Cloudflare's `*.workers.dev` domain. After this, CI redeploys it on every
push to `main` that touches `workers/**`.

```sh
cd workers/auth

wrangler secret put GITHUB_CLIENT_ID
# paste <GITHUB_CLIENT_ID_VALUE> from step 4 when prompted

wrangler secret put GITHUB_CLIENT_SECRET
# paste <GITHUB_CLIENT_SECRET_VALUE> from step 4 when prompted

npm install
wrangler deploy
```

`wrangler deploy` prints the Worker's `*.workers.dev` URL. The Worker is
now live but only reachable on that workers.dev URL until step 7 connects
the custom domain.

---

## 7. Auth Worker — custom domain

Connect `auth.sellersadopt.com` to the Worker so the OAuth callback URL
from step 4 actually routes to it.

In the Cloudflare dashboard:

1. **Workers & Pages** → **sellers-auth** → **Settings** → **Triggers**
   → **Custom Domains** → **Add Custom Domain**.
2. Enter `auth.sellersadopt.com`.
3. Cloudflare auto-creates the DNS record on the `sellersadopt.com` zone.
4. Wait until the status flips to **Active** (usually under a minute).

Sanity check from your terminal:

```sh
curl -I https://auth.sellersadopt.com/auth
```

You should see a 302 redirect with a `Location:` header pointing at
`https://github.com/login/oauth/authorize?...`. (It will redirect even
without a logged-in browser — the Worker doesn't know who you are at that
point.)

---

## 8. CI secrets

The `deploy-workers.yml` workflow needs a Cloudflare API token to redeploy
the auth Worker on push to `main`.

### 8a. Create the Cloudflare API token

In the Cloudflare dashboard:

1. **My Profile** → **API Tokens** → **Create Token**.
2. Use the **Edit Cloudflare Workers** template as a starting point.
3. Permissions you need (the template usually pre-fills both):
   - **Account → Workers Scripts → Edit**
   - **Account → Account Settings → Read**

   No storage permissions are required — the auth Worker has no
   storage bindings, and there is no other Worker to deploy.
4. **Account Resources** → set to your single Cloudflare account (not
   "All accounts").
5. **Zone Resources** → set to **Specific zone** → `sellersadopt.com`.
6. **Continue → Create Token.** Copy the value once → save as
   `<CLOUDFLARE_API_TOKEN_VALUE>`.

### 8b. Grab your account ID

The Cloudflare account ID is visible in the dashboard sidebar of any
account-scoped page, or via:

```sh
wrangler whoami
```

Save as `<CLOUDFLARE_ACCOUNT_ID_VALUE>`.

### 8c. Set the GitHub repo secrets

In GitHub:

1. Repo **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret**.
2. Add two secrets:

   | Name                    | Value                              |
   | ----------------------- | ---------------------------------- |
   | `CLOUDFLARE_API_TOKEN`  | `<CLOUDFLARE_API_TOKEN_VALUE>`     |
   | `CLOUDFLARE_ACCOUNT_ID` | `<CLOUDFLARE_ACCOUNT_ID_VALUE>`    |

Once these are set, any push to `main` that touches `workers/**` will
trigger `.github/workflows/deploy-workers.yml` and redeploy the auth
Worker automatically. You can also force a redeploy from **Actions** →
**Deploy Workers** → **Run workflow**.

The site deploy (`.github/workflows/deploy-site.yml`) does not need any
GitHub secrets — it uses the workflow's OIDC token to publish to Pages.

---

## 9. Add Katie as repo collaborator

Sveltia commits to the repo on Katie's behalf using her own GitHub
identity. So GitHub needs to know she's allowed to push.

1. Repo **Settings** → **Collaborators** → **Add people**.
2. Invite `<KATIE_GITHUB_USERNAME>` (default: `ktbs296-boop`).
3. **Permission:** **Write**. Anything less and Sveltia commits will
   fail with a 403.
4. Have Katie accept the invite (GitHub emails her).

Confirm her username matches the one in `ALLOWED_GITHUB_USERS` from
step 5. If they differ, fix both.

---

## 10. First push to main

Commit any open changes from earlier steps and push:

```sh
# from the repo root
git add workers/auth/wrangler.toml
git commit -m "config: set ALLOWED_GITHUB_USERS for production"
git push origin main
```

Two workflows fire in parallel:

- **Deploy Site** (`.github/workflows/deploy-site.yml`) — builds the
  Astro site and publishes it to GitHub Pages. Triggers on any change
  under `site/**` or to its own workflow file. No secrets needed.
- **Deploy Workers** (`.github/workflows/deploy-workers.yml`) —
  redeploys the auth Worker. Triggers on any change under `workers/**`
  or to its own workflow file. Uses `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` from step 8.

Watch both finish in the **Actions** tab. The first site deploy can take
2–3 minutes; subsequent deploys are quicker. After the deploy finishes,
GitHub Pages may take a couple more minutes to provision the Let's Encrypt
cert for `sellersadopt.com` — if you see a TLS warning on first visit,
wait ~5 minutes and retry.

---

## 11. Verify end-to-end

You're now wired up. Walk through the full editor flow once to be sure.

### 11a. Public site loads

Visit <https://sellersadopt.com>. You should see the homepage. Check the
nav links (About, Letter, Pictures, Blog, Contact) all resolve.

### 11b. Login to /admin/

1. Open <https://sellersadopt.com/admin/> (note the trailing slash).
2. You should see the Sveltia login screen with a **Login with GitHub**
   button.
3. Click it. A popup opens to GitHub.
4. Authorize the OAuth app.
5. The popup should close and the CMS dashboard should appear with the
   four collections (**Marketing pages**, **Family members**,
   **Photo gallery**, **Blog / journal**) listed in the sidebar.

If login fails, jump to [Troubleshooting](#troubleshooting).

### 11c. Edit-and-publish a blog post

1. Open **Blog / journal** → **Welcome to our journey**.
2. Add or change a sentence in the body. Click **Publish**.
3. Wait ~30–60 seconds for the GitHub Pages build to finish (watch the
   **Actions** tab if you want to see it).
4. Hard-refresh <https://sellersadopt.com/blog/welcome>. The change
   should be live.

### 11d. Upload a photo via Photo Gallery

1. Open **Photo gallery** → **New** (top right).
2. Fill in a title and alt text.
3. Click into the **Image** field and pick a small JPEG (under ~1 MB
   ideally; under ~5 MB at the most). Sveltia commits the image binary
   into the repo at `site/src/content/gallery/images/<filename>` along
   with the new markdown file in the same commit. There is no separate
   bucket or upload service — it goes straight to git.
4. Click **Publish**.
5. Wait ~30–60 seconds for GitHub Pages to rebuild.
6. Refresh <https://sellersadopt.com/pictures>. Your new photo should
   appear in the gallery.

If everything above works, you're done. Hand
[CMS-GUIDE.md](./CMS-GUIDE.md) to Katie.

---

## Troubleshooting

### Login fails with "User not authorized"

The auth Worker rejected your GitHub username. Check, in order:

- The `ALLOWED_GITHUB_USERS` value in `workers/auth/wrangler.toml`
  matches your actual GitHub login (case-insensitive, comma-separated,
  trimmed of whitespace).
- Did the Worker redeploy after you changed it? Check **Actions** →
  **Deploy Workers** for a green run after your push, or redeploy
  manually:

  ```sh
  cd workers/auth && wrangler deploy
  ```

- For Katie: confirm her actual GitHub login (the URL slug at
  `github.com/<login>`) matches what's in the allowlist. Display names
  don't count.

### Login fails with "State mismatch" or popup closes silently

This is a CSRF check inside the auth Worker. It usually means the state
cookie isn't surviving the GitHub redirect. Check:

- You're hitting `https://auth.sellersadopt.com` (not a `*.workers.dev`
  preview URL). The state cookie is set with `Secure` so it requires
  HTTPS on a real domain.
- You're not in a browser that strips third-party cookies aggressively
  (Safari with strict tracking prevention sometimes does). Try Chrome
  or Firefox to isolate.
- The custom domain from step 7 is **Active**.

### GitHub OAuth says "callback URL mismatch"

GitHub is comparing the `redirect_uri` we send (built from the request's
`origin`) against the value registered on the OAuth App. They must match
exactly.

- Re-check the OAuth App settings (step 4): **Authorization callback URL**
  must be exactly `https://auth.sellersadopt.com/callback` — no trailing
  slash, no trailing path, `https` scheme.
- Re-check the auth Worker is being hit at `auth.sellersadopt.com`,
  not `sellers-auth.<account>.workers.dev` (which would build a
  different `redirect_uri`).

### Build doesn't trigger when Sveltia commits / Pages doesn't rebuild

The push happened but GitHub Pages didn't rebuild. Check:

- **Actions** tab: do you see a run for the latest commit? The
  `deploy-site.yml` workflow only fires on changes under `site/**`. If
  Sveltia committed an image into `site/src/content/<collection>/images/`
  and a markdown file under `site/src/content/<collection>/`, both are
  under `site/**` and the workflow will fire. If somehow the commit
  landed entirely outside `site/**` (shouldn't happen with the current
  config), the workflow skips by design — kick a manual run via
  **Actions** → **Deploy Site** → **Run workflow**.
- The committing user (Daniel or Katie) is a repo collaborator with
  Write permission (step 9). A non-collaborator's commit will be
  rejected by GitHub before it ever reaches the workflow.
- Branch protection rules on `main` aren't blocking direct pushes.
  Sveltia's `publish_mode: simple` commits straight to `main` and will
  fail with a 403 if a required-PR rule is in place.

### GitHub Pages first build fails with "Get Pages site failed"

The Pages source isn't set. Go back to step 2: **Settings → Pages →
Build and deployment → Source = "GitHub Actions"**, then re-run the
workflow from **Actions** → **Deploy Site** → **Run workflow**.

### Worker deploy fails in CI with "Authentication error"

The `CLOUDFLARE_API_TOKEN` secret is wrong, expired, or missing
permissions. Re-create the token (step 8a) — the only required scopes
are **Workers Scripts:Edit** and **Account Settings:Read**, scoped to
your single account and the `sellersadopt.com` zone — then update the
GitHub secret (step 8c).

### DNS not resolving for `sellersadopt.com` or `auth.sellersadopt.com`

Likely a propagation lag or a proxy-mode mismatch.

- DNS propagation across Cloudflare's edge is typically seconds, but
  some recursive resolvers cache stale NS records. Try `dig
  sellersadopt.com @1.1.1.1` and `dig sellersadopt.com @8.8.8.8` to
  rule out your local resolver.
- For the apex: confirm the four A records from step 3 are present.
  `dig +short sellersadopt.com` should return the four `185.199.x.153`
  addresses (gray cloud) or Cloudflare's anycast IPs (orange cloud).
- For `auth.sellersadopt.com`: the record was auto-created in step 7.
  Confirm it exists in Cloudflare DNS as a CNAME (proxied) pointing at
  the Worker.
- If you flipped to orange cloud and now hit a TLS error, set SSL/TLS
  mode to **Full** (not Flexible, not Off) in the Cloudflare dashboard.

### Image renders broken on the live site even though it's in the repo

Almost always a path or schema issue, not a deploy issue.

- The frontmatter `image:` value should be a path **relative to the
  markdown file**, e.g. `image: images/our-yard.jpg` for a gallery
  entry at `site/src/content/gallery/our-yard.md` referencing
  `site/src/content/gallery/images/our-yard.jpg`. Sveltia writes this
  shape automatically; double-check it on the entry if you hand-edited.
- Astro's `image()` schema helper expects local files only. Bare URLs
  fail validation. The Sveltia image widget always uploads as a local
  file so this should not happen via the CMS, but it can happen if
  someone hand-edits a markdown file.
- Build logs in the **Actions** tab will surface schema errors with the
  offending file path.

---

## Done

If you got through verification, the system is live. From here on, both
you and Katie just edit at <https://sellersadopt.com/admin/>. Hand
[CMS-GUIDE.md](./CMS-GUIDE.md) to Katie — there's nothing private she
needs to be sent out-of-band anymore.
