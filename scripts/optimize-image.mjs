#!/usr/bin/env node
/**
 * Resize + compress images committed under site/src/content/**.
 *
 * Invoked by lint-staged on pre-commit (configured in /package.json).
 * Each staged image is rewritten in place. The longest edge is capped at
 * MAX_EDGE_PX, JPEG/PNG are recompressed at ~82% quality, and EXIF/ICC
 * data is preserved (Image() in Astro relies on dimensions, not metadata).
 *
 * Why: Sveltia commits originals at full camera resolution (often 5–10 MB).
 * That bloats the git repo on every CMS upload. Astro's <Image> component
 * generates optimized WebP variants for visitors at build time, so visitors
 * are unaffected — but the repo still grows. This script keeps repo
 * binaries small while leaving Astro's output pipeline untouched.
 *
 * Notes
 * - Skips files already under MAX_EDGE_PX AND under SKIP_BYTES (already small).
 * - Re-stages the modified file with `git add` so the commit picks up the
 *   compressed version.
 * - Sveltia uploads via the GitHub API bypass this hook — they need a
 *   server-side workflow (see TODO in CMS-GUIDE).
 */
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { extname } from 'node:path';

const MAX_EDGE_PX = 2400;
const JPEG_QUALITY = 82;
const PNG_QUALITY = 82;
const SKIP_BYTES = 400 * 1024; // 400 KB — already-small files left alone

const files = process.argv.slice(2);
if (files.length === 0) process.exit(0);

for (const file of files) {
  try {
    const before = statSync(file).size;
    const meta = await sharp(file).metadata();
    const longestEdge = Math.max(meta.width ?? 0, meta.height ?? 0);

    if (longestEdge <= MAX_EDGE_PX && before <= SKIP_BYTES) {
      console.log(`  skip  ${file} (${formatKB(before)}, ${meta.width}×${meta.height})`);
      continue;
    }

    const ext = extname(file).toLowerCase();
    const buffer = await sharp(file)
      .rotate() // honor EXIF orientation, then strip it
      .resize({
        width: longestEdge > MAX_EDGE_PX ? (meta.width >= meta.height ? MAX_EDGE_PX : null) : null,
        height: longestEdge > MAX_EDGE_PX ? (meta.height > meta.width ? MAX_EDGE_PX : null) : null,
        fit: 'inside',
        withoutEnlargement: true,
      })
      [ext === '.png' ? 'png' : 'jpeg'](
        ext === '.png' ? { quality: PNG_QUALITY, compressionLevel: 9 } : { quality: JPEG_QUALITY, mozjpeg: true }
      )
      .toBuffer();

    const { writeFileSync } = await import('node:fs');
    writeFileSync(file, buffer);

    const after = statSync(file).size;
    const pct = Math.round(((before - after) / before) * 100);
    console.log(`  optim ${file} (${formatKB(before)} → ${formatKB(after)}, -${pct}%)`);

    // Re-stage so the compressed version is in the commit.
    execFileSync('git', ['add', file], { stdio: 'inherit' });
  } catch (err) {
    console.error(`  fail  ${file}: ${err.message}`);
    process.exit(1);
  }
}

function formatKB(bytes) {
  return `${(bytes / 1024).toFixed(0)} KB`;
}
