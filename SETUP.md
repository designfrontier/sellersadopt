# SETUP.md — One-time Cloudflare + GitHub Setup

This document walks through every step needed to take a freshly-built
clone of this repo to a fully-working production site at
<https://sellersadopt.com>. It assumes you (Daniel) are doing this once.

If you're looking for day-to-day editing instructions, see
[CMS-GUIDE.md](./CMS-GUIDE.md). For the high-level overview, see
[README.md](./README.md).

---

## Table of contents

1. [Prereqs](#1-prereqs)
2. [R2 bucket](#2-r2-bucket)
3. [R2 API token](#3-r2-api-token-for-editors-browsers)
4. [Cloudflare Pages project](#4-cloudflare-pages-project)
5. [GitHub OAuth App](#5-github-oauth-app)
6. [Auth Worker secrets and custom domain](#6-auth-worker-secrets--custom-domain)
7. [Cloudflare API token](#7-cloudflare-api-token-for-repo-ci)
8. [GitHub repo secrets](#8-github-repo-secrets)
9. [Add Katie as repo collaborator](#9-add-katie-as-repo-collaborator)
10. [Fill in admin config placeholders](#10-fill-in-admin-config-placeholders)
11. [Verify end-to-end](#11-verify-end-to-end)
12. [Troubleshooting](#troubleshooting)

---

## 1. Prereqs

Before you start, make sure you have:

- A **Cloudflare account** with the `sellersadopt.com` zone active
  (DNS managed by Cloudflare).
- A **GitHub account** that owns this repo (`designfrontier/adoption`).
- **Node.js 22+** locally (the site and Workers both target Node 22).
- **Wrangler CLI** installed and authenticated:

  ```sh
  npm install -g wrangler
  wrangler login
  ```

  `wrangler login` opens a browser to your Cloudflare account and stores
  a token in `~/.wrangler/`. Verify with `wrangler whoami` — it should
  print your account name and account ID.

You'll also want a **password manager** open. You're about to generate
several secrets that need to live somewhere safe, and a couple of them
also need to be shared with Katie.

A note on placeholder syntax in this doc: anywhere you see
`<UPPERCASE_IN_ANGLE_BRACKETS>`, that's a value you (Daniel) need to
substitute in. Search-and-replace as you go.

---

## 2. R2 bucket

The R2 bucket is where uploaded photos live. It's served publicly
through `uploads.sellersadopt.com`.

### 2a. Create the bucket

```sh
wrangler r2 bucket create sellersadopt-uploads
```

The bucket name must match `R2_BUCKET` in `workers/uploads/wrangler.toml`
and the `bucket:` field in `site/public/admin/config.yml` (you'll fill
that in during step 10).

### 2b. Set CORS on the bucket

Sveltia uploads from the browser at `https://sellersadopt.com/admin/`
straight to R2 via the S3 API. R2 needs to allow that origin.

Save this as `r2-cors.json` somewhere local:

```json
[
  {
    "AllowedOrigins": [
      "https://sellersadopt.com"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD", "POST", "DELETE"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Apply it:

```sh
wrangler r2 bucket cors put sellersadopt-uploads --rules ./r2-cors.json
```

(If your wrangler version uses a different flag — `--file` vs `--rules`,
or a positional arg — run `wrangler r2 bucket cors put --help` to see the
exact syntax for your version. The JSON shape above is stable.)

Verify:

```sh
wrangler r2 bucket cors list sellersadopt-uploads
```

If you ever need to test from `localhost:4321` (rare — the CMS expects
the production domain), add `http://localhost:4321` to `AllowedOrigins`
and re-apply.

### 2c. Connect the public custom domain

This is what makes the bucket publicly readable so `<img src="...">`
actually works on the site.

In the Cloudflare dashboard:

1. **R2** → **sellersadopt-uploads** → **Settings**.
2. Under **Public Access**, choose **Connect Domain**.
3. Enter `uploads.sellersadopt.com`.
4. Cloudflare will auto-create a CNAME record on the `sellersadopt.com`
   zone. Confirm.
5. Wait until the status flips to **Connected** (usually < 1 minute).

You can sanity-check by hitting any object you upload at
`https://uploads.sellersadopt.com/<object-key>`.

---

## 3. R2 API token (for editors' browsers)

Editors upload directly to R2 from the browser using an S3-compatible
access key. This is a separate token from the Cloudflare API token used
by CI (step 7).

In the Cloudflare dashboard:

1. **R2** → **Manage R2 API Tokens** → **Create API Token**.
2. **Token name:** `sellersadopt-cms-uploads`
3. **Permissions:** **Object Read & Write**
4. **Specify bucket(s):** scope to `sellersadopt-uploads` only.
5. **TTL:** leave at no expiry (you can rotate manually if needed).
6. **Create.**

Cloudflare shows the credentials **once**. Copy:

- **Access Key ID** → save as `<R2_ACCESS_KEY_ID_VALUE>` (this is public-ish — it goes into `config.yml`)
- **Secret Access Key** → save as `<R2_SECRET_ACCESS_KEY_VALUE>` (sensitive — never commit)

Save both in your password manager. Then **share the Secret Access Key
privately with Katie** (Signal, an encrypted password-manager share, or
in person — not email or Slack). She'll paste it into the Sveltia UI the
first time she uploads an image. See
[CMS-GUIDE.md → "First time only"](./CMS-GUIDE.md#first-time-only-pasting-the-upload-key)
for the editor-side instructions.

---

## 4. Cloudflare Pages project

This builds and hosts the static Astro site.

In the Cloudflare dashboard:

1. **Workers & Pages** → **Create application** → **Pages** →
   **Connect to Git**.
2. Authorize Cloudflare to access GitHub if prompted, then pick
   `designfrontier/adoption`.
3. Configure the build:

   | Field                | Value                          |
   | -------------------- | ------------------------------ |
   | Project name         | `sellersadopt`                 |
   | Production branch    | `main`                         |
   | Build command        | `cd site && npm ci && npm run build` |
   | Build output         | `site/dist`                    |
   | Root directory       | *(leave blank)*                |
   | Environment variables| *(none — site is fully static)*|

4. **Save and Deploy.** The first build will run. It should succeed
   (the site builds clean against an empty `gallery` collection).

5. Once the build is green, add the custom domain:
   - **Custom domains** → **Set up a custom domain** → `sellersadopt.com`.
   - Cloudflare will offer to add the DNS record automatically. Accept.
   - Optionally add `www.sellersadopt.com` and configure a redirect to
     the apex.

You should now be able to visit `https://sellersadopt.com` and see the
site. (`/admin/` won't work yet — we still need the auth Worker.)

---

## 5. GitHub OAuth App

This is what lets Sveltia authenticate editors via GitHub.

1. Visit <https://github.com/settings/applications/new>.
2. Fill in:

   | Field                       | Value                                      |
   | --------------------------- | ------------------------------------------ |
   | Application name            | `Sellers Adopt CMS`                        |
   | Homepage URL                | `https://sellersadopt.com`                 |
   | Application description     | *(optional — "Adoption site CMS")*         |
   | Authorization callback URL  | `https://auth.sellersadopt.com/callback`   |

   The callback URL **must match exactly** — including no trailing slash.
   GitHub will reject the token exchange with `redirect_uri_mismatch`
   otherwise.

3. **Register application.**
4. On the next screen, copy the **Client ID** → save as
   `<GITHUB_CLIENT_ID_VALUE>`.
5. Click **Generate a new client secret**. Copy immediately → save as
   `<GITHUB_CLIENT_SECRET_VALUE>` (you cannot view it again later).

If you're hosting your repo under an organization, register the OAuth
app under that org instead and grant it access to the repo.

---

## 6. Auth Worker secrets + custom domain

The auth Worker (`workers/auth/`) handles the OAuth callback. Background:
[workers/auth/README.md](./workers/auth/README.md).

### 6a. Set the secrets

```sh
cd workers/auth

wrangler secret put GITHUB_CLIENT_ID
# paste <GITHUB_CLIENT_ID_VALUE> when prompted

wrangler secret put GITHUB_CLIENT_SECRET
# paste <GITHUB_CLIENT_SECRET_VALUE> when prompted
```

`ALLOWED_GITHUB_USERS` is a plain var, not a secret — it's defined in
`workers/auth/wrangler.toml` under `[vars]`. Edit that file to set it:

```toml
[vars]
ALLOWED_GITHUB_USERS = "designfrontier,ktbs296-boop"
```

(Adjust the second username to Katie's actual GitHub login if it differs.
Comma-separated, case-insensitive at runtime.)

Commit that change to `wrangler.toml` so CI redeploys pick it up too.

### 6b. Manual first deploy

```sh
# still in workers/auth/
npm install
wrangler deploy
```

This uploads the Worker. Subsequent deploys happen automatically via
GitHub Actions (`.github/workflows/deploy-workers.yml`) once you finish
step 8.

### 6c. Connect the custom domain

In the Cloudflare dashboard:

1. **Workers & Pages** → **sellers-auth** → **Settings** → **Triggers**
   → **Custom Domains** → **Add Custom Domain**.
2. Enter `auth.sellersadopt.com`.
3. Cloudflare auto-creates the DNS record on the zone.
4. Wait until status is **Active** (usually < 1 minute).

Sanity-check: `curl -I https://auth.sellersadopt.com/auth` should return
a 302 redirect to `github.com/login/oauth/authorize`. (It will redirect
even without a logged-in browser — that's expected.)

---

## 7. Cloudflare API token (for repo CI)

The GitHub Actions workflow that auto-redeploys Workers needs an API
token to talk to Cloudflare.

In the Cloudflare dashboard:

1. **My Profile** → **API Tokens** → **Create Token**.
2. Use the **Edit Cloudflare Workers** template as a starting point.
3. Add **Account → Workers R2 Storage → Edit** to the permissions list
   (the uploads Worker has an R2 binding, so deploys need this).
4. Scope **Account Resources** to your single Cloudflare account (not
   "All accounts").
5. Scope **Zone Resources** to `sellersadopt.com` only.
6. **Continue → Create Token.** Copy the value → save as
   `<CLOUDFLARE_API_TOKEN_VALUE>`.

Also grab your **Account ID** — visible on the Cloudflare dashboard
sidebar of any account-scoped page, or via:

```sh
wrangler whoami
```

Save as `<CLOUDFLARE_ACCOUNT_ID_VALUE>`.

---

## 8. GitHub repo secrets

In GitHub:

1. Repo **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret**.
2. Add two secrets:

   | Name                    | Value                              |
   | ----------------------- | ---------------------------------- |
   | `CLOUDFLARE_API_TOKEN`  | `<CLOUDFLARE_API_TOKEN_VALUE>`     |
   | `CLOUDFLARE_ACCOUNT_ID` | `<CLOUDFLARE_ACCOUNT_ID_VALUE>`    |

Once these are set, any push to `main` that touches `workers/**` will
trigger `.github/workflows/deploy-workers.yml` and redeploy the Workers
automatically.

You can also force a redeploy manually from **Actions** →
**Deploy Workers** → **Run workflow**.

---

## 9. Add Katie as repo collaborator

Sveltia commits to the repo on Katie's behalf using her own GitHub
identity. So GitHub needs to know she's allowed to push.

1. Repo **Settings** → **Collaborators** → **Add people**.
2. Invite `<KATIE_GITHUB_USERNAME>` (e.g. `ktbs296-boop`).
3. **Permission:** **Write**. Anything less and Sveltia commits will
   fail with a 403.
4. Have Katie accept the invite (GitHub emails her).

Confirm her username matches the one in `ALLOWED_GITHUB_USERS` from
step 6a — that's the gate the auth Worker checks. If they differ, you'll
update both.

---

## 10. Fill in admin config placeholders

Edit `site/public/admin/config.yml`. Find the
`media_libraries.cloudflare_r2` block and replace the four
`REPLACE_WITH_…` values:

```yaml
media_libraries:
  cloudflare_r2:
    account_id: <CLOUDFLARE_ACCOUNT_ID_VALUE>
    bucket: sellersadopt-uploads
    public_url: https://uploads.sellersadopt.com
    access_key_id: <R2_ACCESS_KEY_ID_VALUE>
    prefix: cms/
```

A few notes:

- `account_id` is the same Cloudflare account ID from step 7.
- `bucket` matches the bucket name from step 2a.
- `public_url` matches the custom domain from step 2c.
- `access_key_id` is the **public** half of the R2 token from step 3.
  This one is safe to commit (it's effectively a username); the matching
  secret access key is **never** in this file — editors paste it into
  the Sveltia UI on first use.

Commit and push:

```sh
git add site/public/admin/config.yml workers/auth/wrangler.toml
git commit -m "config: fill Cloudflare R2 + auth Worker production values"
git push origin main
```

This push triggers two things in parallel:

- Cloudflare Pages rebuilds the site (because `site/**` changed).
- GitHub Actions redeploys the auth Worker (because `workers/auth/**`
  changed in step 6a).

Watch both finish before moving on.

---

## 11. Verify end-to-end

You're now wired up. Walk through the full editor flow once to be sure.

### 11a. Login

1. Open <https://sellersadopt.com/admin/> (note the trailing slash).
2. You should see the Sveltia login screen with a **Login with GitHub**
   button.
3. Click it. A popup opens to GitHub.
4. Authorize the OAuth app.
5. The popup should close and the CMS dashboard should appear with the
   four collections (**Marketing pages**, **Family members**,
   **Photo gallery**, **Blog / journal**) listed in the sidebar.

If login fails, jump to [Troubleshooting](#troubleshooting).

### 11b. Edit-and-publish

1. Open **Blog / journal** → **Welcome to our journey**.
2. Add or change a sentence in the body. Click **Publish**.
3. Wait ~30–60 seconds for Cloudflare Pages to rebuild.
4. Hard-refresh <https://sellersadopt.com/blog/welcome>. The change
   should be live.

### 11c. Image upload

1. Open **Photo gallery** → **New** (top right).
2. Fill in a title and alt text. Click into the **Image** widget.
3. Sveltia prompts for the R2 **Secret Access Key**. Paste
   `<R2_SECRET_ACCESS_KEY_VALUE>`. (You'll only have to do this once
   per browser.)
4. Upload a small test image (under 5 MB).
5. Save and publish.
6. After the next Pages build, the image should appear at
   `https://sellersadopt.com/pictures` and the file itself should be
   reachable at `https://uploads.sellersadopt.com/cms/<filename>`.

If the upload fails or the image 404s, jump to
[Troubleshooting](#troubleshooting).

---

## Troubleshooting

### Login fails with "User not authorized"

The auth Worker rejected your GitHub username. Check:

- The `ALLOWED_GITHUB_USERS` value in `workers/auth/wrangler.toml`
  matches your actual GitHub login (case-insensitive, comma-separated,
  no spaces required but trimmed).
- Did you redeploy the Worker after changing it? Check the Actions tab,
  or manually:

  ```sh
  cd workers/auth && wrangler deploy
  ```

- For Katie: confirm her actual GitHub login (the URL slug at
  `github.com/<login>`) matches what's in the allowlist. Display names
  don't count.

### Login fails with "State mismatch" or popup closes silently

This is a CSRF check inside the auth Worker. It usually means cookies
aren't surviving the GitHub redirect. Check:

- You're hitting `https://auth.sellersadopt.com` (not a `*.workers.dev`
  preview URL). The state cookie is set with `Secure` so it requires
  HTTPS on a real domain.
- You're not in a browser that strips third-party cookies aggressively
  (Safari with strict tracking prevention sometimes does). Try Chrome
  or Firefox to isolate.
- The custom domain from step 6c is **Active**.

### Sveltia gets "Access denied" when uploading

The R2 backend rejected the request. Check, in this order:

- The R2 bucket has the CORS rules from step 2b. Re-apply with
  `wrangler r2 bucket cors put …` and verify with
  `wrangler r2 bucket cors list sellersadopt-uploads`.
- The `access_key_id` in `config.yml` matches the token from step 3,
  and the secret access key the editor pasted into the UI is the
  matching half (not a stale or rotated one).
- The R2 token has **Object Read & Write** for the
  `sellersadopt-uploads` bucket (step 3, step 4 — "Specify bucket(s)").

### Uploaded image returns 404 at `https://uploads.sellersadopt.com/...`

The bucket isn't publicly served, or the custom domain isn't live.
Check:

- **R2 → sellersadopt-uploads → Settings → Public Access** shows
  `uploads.sellersadopt.com` as **Connected** (step 2c).
- DNS for the subdomain resolves: `dig uploads.sellersadopt.com` should
  return a Cloudflare A/AAAA record.
- The object actually exists in the bucket: `wrangler r2 object list
  sellersadopt-uploads --prefix cms/` should show it.

### Build doesn't trigger when Sveltia commits

The push happened but Pages didn't rebuild. Check:

- **Cloudflare Pages → sellersadopt → Deployments**: do you see a build
  for the latest commit? If not, the GitHub→Pages webhook is broken;
  re-link the project under **Settings → Builds & deployments**.
- The committing user (Daniel or Katie) is a repo collaborator with
  Write permission (step 9). A non-collaborator's commit will be
  rejected by GitHub before it ever reaches Pages.
- Branch protection rules aren't blocking direct pushes to `main`.
  Sveltia's `publish_mode: simple` commits straight to `main`.

### GitHub OAuth says "callback URL mismatch"

GitHub is comparing the `redirect_uri` we send (built from the request's
`origin`) against the value registered on the OAuth App. They must match
exactly.

- Re-check the OAuth App settings (step 5): the **Authorization
  callback URL** must be exactly
  `https://auth.sellersadopt.com/callback` — no trailing slash, no
  trailing path, `https`.
- Re-check the auth Worker is being hit at `auth.sellersadopt.com`,
  not `sellers-auth.<account>.workers.dev` (which would build a
  different `redirect_uri`).

### Worker deploy fails in CI with "Authentication error"

The `CLOUDFLARE_API_TOKEN` secret is wrong, expired, or missing R2
permissions. Re-create the token (step 7) making sure to add **Workers
R2 Storage:Edit**, then update the GitHub secret (step 8).

### Pages build fails with "Cannot find module 'astro'"

The build command isn't running `npm ci` in the right directory. Check
the project settings (step 4): build command should be
`cd site && npm ci && npm run build` and build output `site/dist`.

---

## Done

If you got through verification, the system is live. Hand
[CMS-GUIDE.md](./CMS-GUIDE.md) to Katie (and don't forget to send her
the R2 secret access key out-of-band).
