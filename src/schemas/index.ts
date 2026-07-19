import { z } from 'zod';

export const SiteConfigOut = z.object({
  site_name: z.string(),
  site_tagline: z.string(),
  allow_register: z.boolean(),
  version: z.string(),
  mode: z.string().default('web'),
});

export const MemoryCategorySchema = z.enum([
  'fact',
  'preference',
  'event',
  'emotion',
  'relationship',
  'habit',
  'taboo',
  'nickname',
  'dialogue',
  'other',
]);

/** Source of a memory entry — no third-party platform list. */
export const PlatformSchema = z.enum(['manual', 'other']).or(z.string().min(1).max(40));

export const ContextFormatSchema = z.enum([
  'universal',
  'system_prompt',
  'compact',
  'json',
]);

export const CharacterCreateSchema = z.object({
  name: z.string().min(1).max(120),
  display_name: z.string().min(1).max(120),
  avatar_emoji: z.string().default(''),
  persona: z.string().default(''),
  speaking_style: z.string().default(''),
  relationship_stage: z.string().default('初识'),
  notes: z.string().default(''),
});

export const CharacterUpdateSchema = CharacterCreateSchema.partial();

export const CharacterOutSchema = z.object({
  id: z.number(),
  name: z.string(),
  display_name: z.string(),
  avatar_emoji: z.string(),
  persona: z.string(),
  speaking_style: z.string(),
  relationship_stage: z.string(),
  notes: z.string(),
  memory_count: z.number().default(0),
  created_at: z.date(),
  updated_at: z.date(),
});

export const MemoryCreateSchema = z.object({
  content: z.string().min(1).transform(v => v.trim()),
  category: MemoryCategorySchema.default('fact'),
  importance: z.number().min(1).max(5).default(3),
  tags: z.array(z.string()).default([]),
  source_platform: PlatformSchema.default('manual'),
  is_pinned: z.boolean().default(false),
  is_active: z.boolean().default(true),
  occurred_at: z.string().datetime().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
});

export const MemoryUpdateSchema = MemoryCreateSchema.partial();

export const MemoryBulkCreateSchema = z.object({
  memories: z.array(MemoryCreateSchema),
  skip_duplicates: z.boolean().default(true),
});

export const SessionCreateSchema = z.object({
  platform: PlatformSchema.default('other'),
  title: z.string().default(''),
  summary: z.string().default(''),
  raw_excerpt: z.string().default(''),
});

export const ContextRequestSchema = z.object({
  format: ContextFormatSchema.default('universal'),
  max_chars: z.number().min(500).max(50000).default(6000),
  include_persona: z.boolean().default(true),
  include_inactive: z.boolean().default(false),
  min_importance: z.number().min(1).max(5).default(1),
  categories: z.array(MemoryCategorySchema).nullable().optional(),
  pinned_first: z.boolean().default(true),
});

export const ImportTextRequestSchema = z.object({
  text: z.string().min(1),
  source_platform: PlatformSchema.default('other'),
  default_category: MemoryCategorySchema.default('dialogue'),
  default_importance: z.number().min(1).max(5).default(3),
});

export const PortableImportRequestSchema = z.object({
  package: z.any(), // The portable package JSON
  mode: z.enum(['create', 'merge', 'replace']).default('create'),
  target_character_id: z.number().nullable().optional(),
  include_sessions: z.boolean().default(true),
});
