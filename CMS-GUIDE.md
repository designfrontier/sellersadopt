# CMS Guide — Editing the Site

Welcome! This guide is for Daniel and Katie (and anyone else who ever
edits our family adoption website at <https://sellersadopt.com>).

If you'd rather skim, the short version is: go to
<https://sellersadopt.com/admin/>, log in with GitHub, click around, and
hit Publish. Changes go live in about a minute. Read on for the longer
walkthrough.

---

## What this is

Sveltia is a website editor for our family's adoption site. You don't
need to know any code to use it — it's a normal web app with text
boxes, image upload buttons, and a Save button. When you publish a
change, it goes live on the public site (<https://sellersadopt.com>) in
about 30–60 seconds.

Behind the scenes, your edits are saved straight into our project's GitHub
repository, the site automatically rebuilds, and the new version is
deployed. Photos you upload are saved into the same repository, right
next to the post that uses them. You don't need to worry about any of
that — it just works.

---

## How to log in

1. In your browser, go to **<https://sellersadopt.com/admin/>**.
   (Don't forget the trailing slash — `/admin/`, not `/admin`.)
2. You'll see a screen with a button labeled **Login with GitHub**.
   Click it.
3. A popup window opens to GitHub. If you're not already signed in to
   GitHub, sign in.
4. GitHub asks if you want to authorize "Sellers Adopt CMS" to access
   the repo. Click **Authorize**.
5. The popup closes. You're now in the editor.

You'll see a sidebar on the left with four sections:

- **Marketing pages** — the static pages (About Us, Our Letter, etc.)
- **Family members** — profiles for each person on the homepage
- **Photo gallery** — the picture page
- **Blog / journal** — short journal-style posts

Click any of them to see the existing content and edit or add new items.

---

## How to add a blog post

1. In the sidebar, click **Blog / journal**.
2. In the top right, click **New** (or the button labeled with a
   plus sign).
3. Fill in:
   - **Title** — what shows up at the top of the post.
   - **Date** — when the post is dated. The post list sorts newest
     first by this date. (Use today's date for new posts.)
   - **Summary** *(optional)* — one or two sentences shown on the
     blog index. If you skip this, only the title shows.
   - **Hero image** *(optional)* — a big image shown at the top of
     the post. See "How to upload photos" below for the rules of
     thumb on size and format.
   - **Body** — the main text. You can use the formatting toolbar
     (bold, italic, headings, links, lists). You can also drop images
     into the body.
4. When you're happy, click **Publish** (or the equivalent — Sveltia
   sometimes labels it **Save** for direct-publish setups).
5. Wait about a minute. Then refresh the public site
   (<https://sellersadopt.com/blog>) — your post should be there.

---

## How to add a family member to the homepage

1. In the sidebar, click **Family members**.
2. Click **New**.
3. Fill in:
   - **Name** — what shows on their card (e.g. "Daniel" or "E").
   - **Role** — pick `parent`, `child`, or `pet`. This affects how
     they're grouped on the page.
   - **Age** *(optional)* — a number. Used for kids' cards.
   - **Traits** — a one-line description that appears under their name
     (e.g. "Mom, music teacher" or "Loves dragons and pancakes").
   - **Photo** *(optional)* — a portrait. Square crops look best.
   - **Order** — the sort order on the page. Lower numbers come first.
     If you want this person between two existing ones, look at their
     orders and pick a number in between (e.g. 1.5 or just 2).
   - **Bio** — a short paragraph or two. The body of the page.
4. Click **Publish.**

To **edit** an existing family member, just click their name in the
list, change what you want, and Publish.

---

## How to upload photos to the gallery

1. In the sidebar, click **Photo gallery**.
2. Click **New**.
3. Fill in:
   - **Title** — short caption, e.g. "Sledding at the canyon".
   - **Image** — click the box and choose a file from your computer.
     The photo gets saved into the same place as the rest of the site
     content, so it'll show up alongside this post automatically.
   - **Alt text** — a short, plain description of what's in the photo
     (e.g. "Two kids in red snowsuits laughing at the bottom of a
     sledding hill"). **This matters!** Screen readers and people on
     slow connections rely on it.
   - **Caption** *(optional)* — extra context shown below the photo.
   - **Taken at** *(optional)* — the date the photo was taken.
   - **Season** *(optional)* — `spring`, `summer`, `fall`, or `winter`.
4. Click **Publish.**

A few practical things — these matter more than they used to, because
photos now live inside the project itself instead of in a separate cloud
bucket:

- **Compress before you upload.** Aim for **under 1 MB** per photo, with
  a hard ceiling of about **5 MB**. Phone photos are often 3–8 MB
  straight off the camera; please run them through Photos → "Save as
  JPEG" (smaller size) or a tool like ImageOptim before uploading. The
  photo gets bundled into the website itself, so smaller is faster.
- **JPEG is preferred for photos.** PNG is fine for screenshots or
  graphics with text. WebP works too. **Don't upload HEIC** (the iPhone
  default) — convert to JPEG first. On iPhone:
  Settings → Camera → Formats → "Most Compatible" makes new photos
  JPEG by default.
- **Resize huge files.** A 4000×3000 photo is overkill for the web —
  1500–2000 pixels on the long edge is plenty. The Photos app on Mac
  has a "Resize" option in **File → Export**; on iPhone, the
  built-in Mail / Messages "Choose Size" option does the same. Or just
  drop it on Squoosh.app (free in your browser) before uploading.
- **Alt text matters for accessibility.** If you're blank on what to
  write, just describe what you see, plainly. "Katie holding C in the
  backyard." That's enough.

---

## How to edit existing content

1. Click the section in the sidebar (Marketing pages, Family members,
   Photo gallery, or Blog / journal).
2. Click the item you want to edit.
3. Change whatever you want.
4. Click **Publish** (or **Save**).

The change goes live in about a minute. If you don't see it, hard-refresh
your browser (Cmd-Shift-R on Mac, Ctrl-Shift-R on Windows) — your
browser may be showing you a cached older version.

---

## How to delete a post

1. Open the item you want to delete.
2. Look for a **Delete** button (usually at the bottom or in a "..."
   menu near the top right). Click it.
3. Confirm.

Is it gone forever? **Sort of.** It's removed from the live site
immediately. But because everything is stored in our project's history,
Daniel can recover it from there if needed (it's a normal git history,
the same way developers undo changes). If you delete something by
accident and want it back, just text Daniel — he can pull it back.

You **cannot** recover a deleted post from inside the CMS itself.

---

## What I CAN'T change here

The CMS is for **content** — words and pictures. It is not for
**design**. Things you'll need to ask Daniel (or another developer) to
do:

- Change the page layout (where things sit on the page, columns vs.
  rows, etc.).
- Change fonts, colors, or the overall look of the site.
- Change the navigation menu (the links across the top).
- Add a brand new type of content (e.g. a "videos" section).
- Change the URL of an existing page.
- Change anything outside the four sections in the sidebar.

If you want any of those things, just text Daniel a description of what
you want. They're usually quick changes for him.

---

## Common gotchas

A few small things that can trip people up:

- **Leaving an unsaved draft.** If you close the tab without clicking
  Publish, you might lose your edits. Sveltia tries to warn you, but
  not always reliably. If you've been writing for a while, hit Publish
  even on a half-finished draft just to be safe — you can always edit
  it again.

- **Uploading huge unsized photos.** Photos are now stored as part of
  the site itself, so a giant file makes both the upload slow and the
  page slow to load later. If your file is bigger than 5 MB, please
  resize or re-export to JPEG first. (See "How to upload photos" for
  tools.)

- **Using a non-image file in an image field.** The image upload box
  only wants real images (JPEG, PNG, WebP, GIF). PDFs, videos, or
  Word docs won't work — they'll either be rejected or break the page
  silently. If you need to share a non-image file, ask Daniel.

- **Editing in two browser tabs at once.** If you (or you and Katie)
  open the same item in two places and both hit Publish, the second
  save wins. This is rare but worth knowing. Coordinate when in doubt.

- **Not waiting for the rebuild.** After you publish, give it 30–60
  seconds before refreshing the public site. If it still doesn't show,
  hard-refresh once. If still nothing, text Daniel.

- **The trailing slash on `/admin/`.** Some people get a 404 going to
  `/admin` (no slash). Always include the trailing slash.

- **The login popup getting blocked.** Some browsers block popups by
  default. If clicking "Login with GitHub" does nothing, look for a
  popup-blocked icon in your address bar and allow popups for
  `sellersadopt.com`.

---

## Quick reference

| Task                       | Where to start                                       |
| -------------------------- | ---------------------------------------------------- |
| Add a blog post            | Sidebar → **Blog / journal** → **New**               |
| Add a family member        | Sidebar → **Family members** → **New**               |
| Upload a gallery photo     | Sidebar → **Photo gallery** → **New**                |
| Edit an existing page      | Sidebar → **Marketing pages** → click the page       |
| Edit a family member       | Sidebar → **Family members** → click the name        |
| Delete something           | Open it → **Delete** button (usually in a "…" menu)  |
| Recover something deleted  | Text Daniel                                          |

That's it. Welcome to the editor. If you get stuck, screenshot whatever
you're seeing and send it to Daniel — most fixes take five minutes.
