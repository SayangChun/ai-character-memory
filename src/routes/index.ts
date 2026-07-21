import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { buildContext } from '../services/context';
import {
  buildPortablePackage,
  buildAiMemoryPack,
  formatSpecPublic,
  suggestedFilename,
  suggestedAiPackFilename,
  MIME_TYPE,
  AI_PACK_MIME,
  FORMAT_ID,
  FORMAT_VERSION,
  AI_PACK_FORMAT_ID,
  AI_PACK_FORMAT_VERSION,
} from '../services/portable';
import { contentHash, tagsFromJson, tagsToJson } from '../services/utils';
import { PLATFORMS } from '../services/platforms';
import { suggestMemoriesFromText } from '../services/importSuggest';
import {
  buildExportPromptForPreviousAi,
  parseAiFullDump,
} from '../services/aiDump';

const router = Router();

function parseId(value: string | string[]): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return parseInt(raw, 10);
}

function memoryOut(m: { tags: string; [k: string]: unknown }) {
  return { ...m, tags: tagsFromJson(m.tags) };
}

function contextOptionsFromBody(body: Record<string, unknown> = {}) {
  return {
    fmt: (body.format ?? body.fmt ?? 'universal') as any,
    maxChars: Number(body.max_chars ?? body.maxChars ?? 6000),
    includePersona: Boolean(body.include_persona ?? body.includePersona ?? true),
    includeInactive: Boolean(body.include_inactive ?? body.includeInactive ?? false),
    minImportance: Number(body.min_importance ?? body.minImportance ?? 1),
    categories: (body.categories as string[] | null | undefined) ?? null,
    pinnedFirst: Boolean(body.pinned_first ?? body.pinnedFirst ?? true),
  };
}

async function uniqueCharacterName(base: string): Promise<string> {
  let name = base.trim() || 'character';
  if (!(await prisma.character.findUnique({ where: { name } }))) return name;
  let i = 2;
  while (await prisma.character.findUnique({ where: { name: `${base}_${i}` } })) {
    i += 1;
  }
  return `${base}_${i}`;
}

// Health
router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    version: '1.2.0',
    mode: 'web',
    site_name: 'AI 记忆迁移',
    product_mode: 'one_shot_export',
  });
});

router.get('/site', (_req, res) => {
  res.json({
    site_name: 'AI 记忆迁移',
    site_tagline: '一次性整理 · 下载本地 · 换平台直接恢复',
    product_mode: 'one_shot_export',
    product_boundary:
      '本站是一次性记忆整理器，不是常驻云端记忆库。恢复记忆路径是本地 .memory.md → 新 AI，不经过本站。',
    primary_flow:
      '给旧 AI 提示词 → 旧 AI 输出全量信息 → 粘贴到本站解析 → 按需补细节 → 下载 .memory.md → 发给新 AI',
    allow_register: false,
    version: '1.2.0',
    mode: 'web',
  });
});

/** Compatibility endpoint — no third-party platforms exposed. */
router.get('/platforms', (_req, res) => {
  res.json(PLATFORMS);
});

router.get('/portable/spec', (_req, res) => {
  res.json(formatSpecPublic());
});

/** Prompt user copies into their previous AI to request a full memory dump. */
router.get('/export-prompt', (_req, res) => {
  res.json(buildExportPromptForPreviousAi());
});

/**
 * Preview-parse dump text without writing to DB.
 * Body: { text: string }
 */
router.post('/import/ai-dump/preview', (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ detail: '请粘贴旧 AI 返回的全量导出正文' });
  if (text.length > 500_000) {
    return res.status(400).json({ detail: '文本过长（上限约 50 万字符）' });
  }
  const parsed = parseAiFullDump(text);
  res.json({
    ok: true,
    character: parsed.character,
    memory_count: parsed.memories.length,
    memories_preview: parsed.memories.slice(0, 30),
    parse_notes: parsed.parse_notes,
    source_format: parsed.source_format,
  });
});

/**
 * Parse AI full dump → create character + memories in one shot.
 * Body: { text: string, mode?: 'create' }
 */
router.post('/import/ai-dump', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ detail: '请粘贴旧 AI 返回的全量导出正文' });
  if (text.length > 500_000) {
    return res.status(400).json({ detail: '文本过长（上限约 50 万字符）' });
  }

  try {
    const parsed = parseAiFullDump(text);
    if (
      !parsed.character.display_name?.trim() ||
      parsed.character.display_name === '未命名角色'
    ) {
      // still allow if we have persona or memories
      if (!parsed.character.persona && parsed.memories.length === 0) {
        return res.status(400).json({
          detail:
            '未能解析出有效人设或记忆。请确认已粘贴旧 AI 的完整导出正文（含「角色身份 / 人设 / 持久记忆」）。',
          parse_notes: parsed.parse_notes,
        });
      }
    }

    const name = await uniqueCharacterName(parsed.character.name || 'imported');
    const char = await prisma.character.create({
      data: {
        name,
        display_name: parsed.character.display_name || name,
        avatar_emoji: '',
        persona: parsed.character.persona || '',
        speaking_style: parsed.character.speaking_style || '',
        relationship_stage: parsed.character.relationship_stage || '初识',
        notes: parsed.character.notes || '',
      },
    });

    let created = 0;
    const seenHash = new Set<string>();
    for (const m of parsed.memories) {
      const content = m.content.trim();
      if (!content) continue;
      const hash = contentHash(content);
      if (seenHash.has(hash)) continue;
      seenHash.add(hash);
      await prisma.memory.create({
        data: {
          character_id: char.id,
          content,
          content_hash: hash,
          category: m.category || 'other',
          importance: m.importance || 3,
          tags: tagsToJson(m.tags?.length ? m.tags : ['ai-dump']),
          source_platform: 'ai_dump',
          is_pinned: Boolean(m.is_pinned),
          is_active: true,
        },
      });
      created += 1;
    }

    await prisma.sessionLog.create({
      data: {
        character_id: char.id,
        platform: 'ai_dump',
        title: `旧 AI 全量导入 ${created} 条`,
        summary: `从旧 AI 导出正文解析：人设 + ${created} 条记忆`,
        raw_excerpt: text.slice(0, 2000),
      },
    });

    res.status(201).json({
      ok: true,
      message: `已导入「${char.display_name}」：${created} 条记忆。可在下一步核对并补充，再下载带走。`,
      character: { ...char, memory_count: created },
      memory_count: created,
      parse_notes: parsed.parse_notes,
      source_format: parsed.source_format,
    });
  } catch (err: any) {
    console.error('[import/ai-dump]', err);
    res.status(500).json({ detail: err.message || '导入失败' });
  }
});

// Stats
router.get('/stats', async (_req, res) => {
  try {
    const charCount = await prisma.character.count();
    const memCount = await prisma.memory.count();
    const activeCount = await prisma.memory.count({ where: { is_active: true } });
    const pinnedCount = await prisma.memory.count({ where: { is_pinned: true } });

    const byCategory = await prisma.memory.groupBy({
      by: ['category'],
      _count: { id: true },
    });
    const catMap = byCategory.reduce((acc, cur) => {
      acc[cur.category] = cur._count.id;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      character_count: charCount,
      memory_count: memCount,
      active_memory_count: activeCount,
      pinned_memory_count: pinnedCount,
      by_category: catMap,
    });
  } catch (err: any) {
    res.status(500).json({ detail: err.message || '统计失败' });
  }
});

// Characters
router.get('/characters', async (_req, res) => {
  try {
    const chars = await prisma.character.findMany({
      include: { _count: { select: { memories: true } } },
      orderBy: { updated_at: 'desc' },
    });
    res.json(chars.map((c) => ({ ...c, memory_count: c._count.memories })));
  } catch (err: any) {
    console.error('[characters]', err);
    res.status(500).json({ detail: err.message || '加载角色失败' });
  }
});

router.post('/characters', async (req, res) => {
  const {
    name,
    display_name,
    avatar_emoji,
    persona,
    speaking_style,
    relationship_stage,
    notes,
  } = req.body || {};
  if (!name || !display_name) {
    return res.status(400).json({ detail: 'name 与 display_name 必填' });
  }
  try {
    const char = await prisma.character.create({
      data: {
        name: String(name).trim(),
        display_name: String(display_name).trim(),
        avatar_emoji: avatar_emoji || '',
        persona: persona || '',
        speaking_style: speaking_style || '',
        relationship_stage: relationship_stage || '初识',
        notes: notes || '',
      },
    });
    res.status(201).json({ ...char, memory_count: 0 });
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ detail: `角色内部名已存在：${name}` });
    res.status(400).json({ detail: err.message });
  }
});

router.get('/characters/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ detail: '无效的角色 id' });
  const char = await prisma.character.findUnique({
    where: { id },
    include: { _count: { select: { memories: true } } },
  });
  if (!char) return res.status(404).json({ detail: '角色不存在' });
  res.json({ ...char, memory_count: char._count.memories });
});

router.patch('/characters/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const data = { ...(req.body || {}) };
  // name is the stable key — do not allow rename via patch body noise
  delete data.id;
  delete data.name;
  delete data.created_at;
  delete data.memory_count;
  try {
    const char = await prisma.character.update({
      where: { id },
      data,
      include: { _count: { select: { memories: true } } },
    });
    res.json({ ...char, memory_count: char._count.memories });
  } catch (err: any) {
    res.status(400).json({ detail: err.message });
  }
});

router.delete('/characters/:id', async (req, res) => {
  const id = parseId(req.params.id);
  try {
    await prisma.character.delete({ where: { id } });
    res.json({ ok: true, deleted_id: id });
  } catch (err: any) {
    res.status(400).json({ detail: err.message });
  }
});

// Memories
router.get('/characters/:character_id/memories', async (req, res) => {
  const character_id = parseId(req.params.character_id);
  const q = req.query.q as string | undefined;
  const category = req.query.category as string | undefined;
  const platform = req.query.platform as string | undefined;
  const pinned_only = req.query.pinned_only === 'true';
  const active_only = req.query.active_only === 'true';
  const min_importance = req.query.min_importance
    ? parseInt(req.query.min_importance as string, 10)
    : 1;

  const where: any = { character_id };
  if (q) where.content = { contains: q };
  if (category) where.category = category;
  if (platform) where.source_platform = platform;
  if (pinned_only) where.is_pinned = true;
  if (active_only) where.is_active = true;
  if (min_importance > 1) where.importance = { gte: min_importance };

  try {
    const memories = await prisma.memory.findMany({
      where,
      orderBy: [{ is_pinned: 'desc' }, { importance: 'desc' }, { updated_at: 'desc' }],
    });
    res.json(memories.map(memoryOut));
  } catch (err: any) {
    res.status(500).json({ detail: err.message || '加载记忆失败' });
  }
});

router.post('/characters/:character_id/memories', async (req, res) => {
  const character_id = parseId(req.params.character_id);
  const data = req.body || {};
  if (!data.content || !String(data.content).trim()) {
    return res.status(400).json({ detail: 'content 必填' });
  }
  const content = String(data.content).trim();
  const content_hash = contentHash(content);

  try {
    const memory = await prisma.memory.create({
      data: {
        character_id,
        content,
        content_hash,
        category: data.category || 'fact',
        importance: data.importance || 3,
        tags: tagsToJson(data.tags),
        source_platform: data.source_platform || 'manual',
        is_pinned: data.is_pinned || false,
        is_active: data.is_active !== undefined ? data.is_active : true,
        occurred_at: data.occurred_at ? new Date(data.occurred_at) : null,
        expires_at: data.expires_at ? new Date(data.expires_at) : null,
      },
    });
    await prisma.character.update({
      where: { id: character_id },
      data: { updated_at: new Date() },
    });
    res.status(201).json(memoryOut(memory));
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ detail: '已存在相同内容的记忆' });
    res.status(400).json({ detail: err.message });
  }
});

router.post('/characters/:character_id/memories/bulk', async (req, res) => {
  const character_id = parseId(req.params.character_id);
  const { memories = [], skip_duplicates = true } = req.body || {};
  if (!Array.isArray(memories)) {
    return res.status(400).json({ detail: 'memories 必须是数组' });
  }

  const char = await prisma.character.findUnique({ where: { id: character_id } });
  if (!char) return res.status(404).json({ detail: '角色不存在' });

  const created: any[] = [];
  for (const item of memories) {
    if (!item?.content || !String(item.content).trim()) continue;
    const content = String(item.content).trim();
    const content_hash = contentHash(content);
    try {
      const memory = await prisma.memory.create({
        data: {
          character_id,
          content,
          content_hash,
          category: item.category || 'fact',
          importance: item.importance || 3,
          tags: tagsToJson(item.tags),
          source_platform: item.source_platform || 'manual',
          is_pinned: !!item.is_pinned,
          is_active: item.is_active !== undefined ? !!item.is_active : true,
        },
      });
      created.push(memoryOut(memory));
    } catch (err: any) {
      if (err.code === 'P2002' && skip_duplicates) continue;
      if (err.code === 'P2002') {
        return res.status(409).json({ detail: '存在重复记忆且未开启 skip_duplicates' });
      }
      return res.status(400).json({ detail: err.message });
    }
  }

  await prisma.character.update({
    where: { id: character_id },
    data: { updated_at: new Date() },
  });
  res.status(201).json(created);
});

router.patch('/memories/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const data: any = { ...(req.body || {}) };
  delete data.id;
  delete data.character_id;
  delete data.created_at;
  if (data.tags) data.tags = tagsToJson(data.tags);
  if (data.content) {
    data.content = String(data.content).trim();
    data.content_hash = contentHash(data.content);
  }
  if (data.occurred_at) data.occurred_at = new Date(data.occurred_at);
  if (data.expires_at) data.expires_at = new Date(data.expires_at);

  try {
    const memory = await prisma.memory.update({ where: { id }, data });
    res.json(memoryOut(memory));
  } catch (err: any) {
    res.status(400).json({ detail: err.message });
  }
});

router.delete('/memories/:id', async (req, res) => {
  const id = parseId(req.params.id);
  try {
    await prisma.memory.delete({ where: { id } });
    res.json({ ok: true, deleted_id: id });
  } catch (err: any) {
    res.status(400).json({ detail: err.message });
  }
});

// Sessions
router.post('/characters/:character_id/sessions', async (req, res) => {
  const character_id = parseId(req.params.character_id);
  const data = req.body || {};
  const char = await prisma.character.findUnique({ where: { id: character_id } });
  if (!char) return res.status(404).json({ detail: '角色不存在' });

  try {
    const session = await prisma.sessionLog.create({
      data: {
        character_id,
        platform: data.platform || 'other',
        title: data.title || '',
        summary: data.summary || '',
        raw_excerpt: data.raw_excerpt || '',
      },
    });
    res.status(201).json(session);
  } catch (err: any) {
    res.status(400).json({ detail: err.message });
  }
});

// Context
router.post('/characters/:character_id/context', async (req, res) => {
  const character_id = parseId(req.params.character_id);
  const char = await prisma.character.findUnique({ where: { id: character_id } });
  if (!char) return res.status(404).json({ detail: '角色不存在' });
  const memories = await prisma.memory.findMany({ where: { character_id } });
  const ctx = buildContext(char, memories, contextOptionsFromBody(req.body));
  res.json(ctx);
});

// Import suggest (offline heuristics)
router.post('/characters/:character_id/import/suggest', async (req, res) => {
  const character_id = parseId(req.params.character_id);
  const char = await prisma.character.findUnique({ where: { id: character_id } });
  if (!char) return res.status(404).json({ detail: '角色不存在' });

  const text = (req.body?.text || '').trim();
  if (!text) return res.status(400).json({ detail: 'text 必填' });

  const suggestions = suggestMemoriesFromText(text, {
    default_category: req.body?.default_category || 'dialogue',
    default_importance: req.body?.default_importance || 3,
  });

  res.json({
    character_id,
    suggestions,
    count: suggestions.length,
  });
});

// Portable packages
// - kind=ai (default): Markdown memory pack → send to any new AI (no website)
// - kind=json: ACM structured backup → re-import into this site

function attachmentHeaders(res: Response, filename: string, contentType: string) {
  const encoded = encodeURIComponent(filename);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encoded}`
  );
  res.setHeader('Content-Type', contentType);
}

router.get('/characters/:character_id/portable', async (req, res) => {
  const character_id = parseId(req.params.character_id);
  const char = await prisma.character.findUnique({ where: { id: character_id } });
  if (!char) return res.status(404).json({ detail: '角色不存在' });
  const memories = await prisma.memory.findMany({ where: { character_id } });
  const sessions = await prisma.sessionLog.findMany({ where: { character_id } });

  const kind = String(req.query.kind || 'ai').toLowerCase();
  if (kind === 'json' || kind === 'acm' || kind === 'backup') {
    return res.json(buildPortablePackage(char, memories, sessions));
  }

  const includeSessions = String(req.query.include_sessions || '') === '1';
  const pack = buildAiMemoryPack(char, memories, sessions, { includeSessions });
  res.json({
    ...pack.meta,
    markdown: pack.markdown,
    backup_json_url: `/api/characters/${character_id}/portable?kind=json`,
  });
});

router.get('/characters/:character_id/portable/download', async (req, res) => {
  const character_id = parseId(req.params.character_id);
  const char = await prisma.character.findUnique({ where: { id: character_id } });
  if (!char) return res.status(404).json({ detail: '角色不存在' });
  const memories = await prisma.memory.findMany({ where: { character_id } });
  const sessions = await prisma.sessionLog.findMany({ where: { character_id } });

  const kind = String(req.query.kind || 'ai').toLowerCase();

  if (kind === 'json' || kind === 'acm' || kind === 'backup') {
    const pkg = buildPortablePackage(char, memories, sessions);
    const filename = suggestedFilename(char.name);
    attachmentHeaders(res, filename, MIME_TYPE);
    res.setHeader('X-ACM-Format', FORMAT_ID);
    res.setHeader('X-ACM-Format-Version', FORMAT_VERSION);
    return res.json(pkg);
  }

  const includeSessions = String(req.query.include_sessions || '') === '1';
  const includeAppendix = String(req.query.include_appendix || '') === '1';
  const pack = buildAiMemoryPack(char, memories, sessions, {
    includeSessions,
    includeMachineAppendix: includeAppendix,
  });
  const filename = suggestedAiPackFilename(char.name);
  attachmentHeaders(res, filename, AI_PACK_MIME);
  res.setHeader('X-Memory-Pack-Format', AI_PACK_FORMAT_ID);
  res.setHeader('X-Memory-Pack-Version', AI_PACK_FORMAT_VERSION);
  res.send(pack.markdown);
});

// Portable import
router.post('/portable/import', async (req, res) => {
  try {
    const mode = String(req.query.mode || req.body?.mode || 'create') as
      | 'create'
      | 'merge'
      | 'replace';
    const pkg = req.body?.package && req.body.package.character ? req.body.package : req.body;
    if (!pkg || typeof pkg !== 'object') {
      return res.status(400).json({ detail: '请求体必须是 ACM 可移植包 JSON' });
    }
    if (pkg.format && pkg.format !== FORMAT_ID) {
      return res.status(400).json({
        detail: `不支持的 format：${pkg.format}（期望 ${FORMAT_ID}）`,
      });
    }
    const ch = pkg.character;
    if (!ch?.name || !ch?.display_name) {
      return res.status(400).json({ detail: 'package.character.name 与 display_name 必填' });
    }

    const memoriesIn: any[] = Array.isArray(pkg.memories) ? pkg.memories : [];
    const sessionsIn: any[] = Array.isArray(pkg.sessions) ? pkg.sessions : [];
    const includeSessions = req.body?.include_sessions !== false;

    let character;
    let createdMemories = 0;
    let skipped = 0;
    let message = '';

    if (mode === 'create') {
      const name = await uniqueCharacterName(String(ch.name));
      character = await prisma.character.create({
        data: {
          name,
          display_name: ch.display_name,
          avatar_emoji: ch.avatar_emoji || '',
          persona: ch.persona || '',
          speaking_style: ch.speaking_style || '',
          relationship_stage: ch.relationship_stage || '初识',
          notes: ch.notes || '',
        },
      });
      for (const m of memoriesIn) {
        if (!m?.content) continue;
        const content = String(m.content).trim();
        const hash = m.content_hash || contentHash(content);
        try {
          await prisma.memory.create({
            data: {
              character_id: character.id,
              content,
              content_hash: hash,
              category: m.category || 'fact',
              importance: Number(m.importance || 3),
              tags: tagsToJson(m.tags),
              source_platform: m.source_platform || 'manual',
              is_pinned: !!m.is_pinned,
              is_active: m.is_active !== undefined ? !!m.is_active : true,
              occurred_at: m.occurred_at ? new Date(m.occurred_at) : null,
              expires_at: m.expires_at ? new Date(m.expires_at) : null,
            },
          });
          createdMemories += 1;
        } catch (err: any) {
          if (err.code === 'P2002') {
            skipped += 1;
            continue;
          }
          throw err;
        }
      }
      message = `已新建角色「${character.display_name}」并导入 ${createdMemories} 条记忆`;
    } else {
      // merge | replace — by name, or target_character_id
      const targetId = req.body?.target_character_id
        ? Number(req.body.target_character_id)
        : null;
      if (targetId) {
        character = await prisma.character.findUnique({ where: { id: targetId } });
      } else {
        character = await prisma.character.findUnique({ where: { name: String(ch.name) } });
      }

      if (!character) {
        character = await prisma.character.create({
          data: {
            name: String(ch.name),
            display_name: ch.display_name,
            avatar_emoji: ch.avatar_emoji || '',
            persona: ch.persona || '',
            speaking_style: ch.speaking_style || '',
            relationship_stage: ch.relationship_stage || '初识',
            notes: ch.notes || '',
          },
        });
      } else {
        character = await prisma.character.update({
          where: { id: character.id },
          data: {
            display_name: ch.display_name || character.display_name,
            avatar_emoji: ch.avatar_emoji || character.avatar_emoji,
            persona: ch.persona !== undefined ? ch.persona : character.persona,
            speaking_style:
              ch.speaking_style !== undefined ? ch.speaking_style : character.speaking_style,
            relationship_stage:
              ch.relationship_stage || character.relationship_stage,
            notes: ch.notes !== undefined ? ch.notes : character.notes,
          },
        });
      }

      if (mode === 'replace') {
        await prisma.memory.deleteMany({ where: { character_id: character.id } });
        if (includeSessions) {
          await prisma.sessionLog.deleteMany({ where: { character_id: character.id } });
        }
      }

      for (const m of memoriesIn) {
        if (!m?.content) continue;
        const content = String(m.content).trim();
        const hash = m.content_hash || contentHash(content);
        try {
          await prisma.memory.create({
            data: {
              character_id: character.id,
              content,
              content_hash: hash,
              category: m.category || 'fact',
              importance: Number(m.importance || 3),
              tags: tagsToJson(m.tags),
              source_platform: m.source_platform || 'manual',
              is_pinned: !!m.is_pinned,
              is_active: m.is_active !== undefined ? !!m.is_active : true,
              occurred_at: m.occurred_at ? new Date(m.occurred_at) : null,
              expires_at: m.expires_at ? new Date(m.expires_at) : null,
            },
          });
          createdMemories += 1;
        } catch (err: any) {
          if (err.code === 'P2002') {
            // merge: upgrade pin/importance if needed
            if (mode === 'merge') {
              const existing = await prisma.memory.findFirst({
                where: { character_id: character.id, content_hash: hash },
              });
              if (existing) {
                await prisma.memory.update({
                  where: { id: existing.id },
                  data: {
                    is_pinned: existing.is_pinned || !!m.is_pinned,
                    importance: Math.max(existing.importance, Number(m.importance || 3)),
                    is_active: existing.is_active || (m.is_active !== false),
                  },
                });
              }
            }
            skipped += 1;
            continue;
          }
          throw err;
        }
      }
      message =
        mode === 'replace'
          ? `已覆盖「${character.display_name}」的记忆，写入 ${createdMemories} 条`
          : `已合并到「${character.display_name}」，新增 ${createdMemories} 条，跳过 ${skipped} 条`;
    }

    if (includeSessions && sessionsIn.length) {
      for (const s of sessionsIn) {
        await prisma.sessionLog.create({
          data: {
            character_id: character.id,
            platform: s.platform || 'other',
            title: s.title || '',
            summary: s.summary || '',
            raw_excerpt: s.raw_excerpt || '',
          },
        });
      }
    }

    const full = await prisma.character.findUnique({
      where: { id: character.id },
      include: { _count: { select: { memories: true } } },
    });

    res.status(201).json({
      ok: true,
      mode,
      message,
      created_memories: createdMemories,
      skipped,
      character: full
        ? { ...full, memory_count: full._count.memories }
        : { ...character, memory_count: createdMemories },
    });
  } catch (err: any) {
    console.error('[portable/import]', err);
    res.status(400).json({ detail: err.message || '导入失败' });
  }
});

export default router;
