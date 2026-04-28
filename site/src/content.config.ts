import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Structured marketing pages (about, our-home, letter, etc.).
 *
 * `slug` is derived from the filename by Astro's default `generateId`.
 * Body is markdown (rendered via `entry.render()` in Astro pages).
 */
const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      order: z.number(),
      summary: z.string().nullable().optional(),
      hero: image().nullable().optional(),
    }),
});

/**
 * Family member profiles. Bio lives in markdown body.
 */
const family = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/family' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      role: z.enum(['parent', 'child', 'pet']),
      age: z.number().nullable().optional(),
      traits: z.string(),
      photo: image().nullable().optional(),
      order: z.number(),
    }),
});

/**
 * Photo gallery items. `image` is required for accessibility (alt is too).
 *
 * NOTE: No seed file is included for `gallery` in this ticket. Gallery seeds
 * require real binary images alongside the markdown, and engineer E1 will
 * populate this collection when migrating `pictures.astro` in Wave 2 (A2).
 * The schema is verified by the empty-collection build, which is fine —
 * Astro accepts collections with zero entries.
 */
const gallery = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/gallery' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      image: image(),
      alt: z.string(),
      caption: z.string().nullable().optional(),
      takenAt: z.coerce.date().nullable().optional(),
      season: z.enum(['spring', 'summer', 'fall', 'winter']).nullable().optional(),
    }),
});

/**
 * Blog posts. Body is markdown. Sorted by `date` desc on the index page.
 * `hero` is optional — empty hero just renders a heading + body.
 */
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      summary: z.string().nullable().optional(),
      hero: image().nullable().optional(),
    }),
});

export const collections = { pages, family, gallery, blog };
