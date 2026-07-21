import { Character, Memory, SessionLog } from '@prisma/client';
import crypto from 'crypto';
import { contentHash, isExpired, tagsFromJson } from './utils';
import { CATEGORY_LABELS_ZH } from './context';

/** Structured backup format (re-import into this site). */
export const FORMAT_ID = 'ai-character-memory';
export const FORMAT_VERSION = '1.0';
export const MIME_TYPE = 'application/vnd.ai-character-memory+json';
export const FILE_EXTENSION = '.acm.json';

/**
 * AI-ready memory pack — primary local deliverable.
 * Upload / paste this file into any new AI chat to restore memory
 * without going through this website.
 */
export const AI_PACK_FORMAT_ID = 'ai-memory-pack';
export const AI_PACK_FORMAT_VERSION = '2.0';
export const AI_PACK_MIME = 'text/markdown; charset=utf-8';
export const AI_PACK_EXTENSION = '.memory.md';

const CATEGORY_ORDER = [
  'taboo',
  'nickname',
  'relationship',
  'fact',
  'preference',
  'habit',
  'emotion',
  'event',
  'dialogue',
  'other',
];

function iso(dt: Date | null): string | null {
  if (!dt) return null;
  return dt.toISOString();
}

function safeSlug(name: string): string {
  const s = (name || 'character').trim().replace(/[^\w\u4e00-\u9fff\-]+/g, '-');
  const res = s.replace(/^[-_]+|[-_]+$/g, '') || 'character';
  return res.substring(0, 80);
}

export function suggestedFilename(characterName: string, when?: Date): string {
  const d = when || new Date();
  const stamp = d.toISOString().split('T')[0].replace(/-/g, '');
  return `${safeSlug(characterName)}-${stamp}${FILE_EXTENSION}`;
}

export function suggestedAiPackFilename(characterName: string, when?: Date): string {
  const d = when || new Date();
  const stamp = d.toISOString().split('T')[0].replace(/-/g, '');
  return `${safeSlug(characterName)}-${stamp}${AI_PACK_EXTENSION}`;
}

export function checksumPayload(body: unknown): string {
  const raw = JSON.stringify(body);
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

function sortForAi(memories: Memory[]): Memory[] {
  return [...memories].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    if (a.importance !== b.importance) return b.importance - a.importance;
    const aTime = a.updated_at ? a.updated_at.getTime() : 0;
    const bTime = b.updated_at ? b.updated_at.getTime() : 0;
    return bTime - aTime;
  });
}

function activeMemories(memories: Memory[], includeInactive = false): Memory[] {
  const now = new Date();
  return memories.filter((m) => {
    if (!includeInactive && !m.is_active) return false;
    if (isExpired(m.expires_at, now)) return false;
    return true;
  });
}

/**
 * Build the AI-ready Markdown document.
 * This is the main local memory pack: send it to a new AI to restore memory.
 */
export function buildAiMemoryPack(
  character: Character,
  memories: Memory[],
  sessions: SessionLog[] = [],
  options: {
    includeInactive?: boolean;
    includeSessions?: boolean;
    includeMachineAppendix?: boolean;
  } = {}
): { markdown: string; meta: Record<string, unknown> } {
  const includeInactive = options.includeInactive ?? false;
  const includeSessions = options.includeSessions ?? false;
  const includeMachineAppendix = options.includeMachineAppendix ?? false;

  const used = sortForAi(activeMemories(memories, includeInactive));
  const display = character.display_name || character.name;
  const exportedAt = new Date().toISOString();

  const lines: string[] = [];

  // ── header & instructions for the receiving AI ──
  lines.push(`# AI 记忆恢复包 · ${display}`);
  lines.push('');
  lines.push('> **给接收本文件的 AI（请先读）**');
  lines.push('>');
  lines.push(
    '> 用户把本文件发给你，是为了在**新的对话 / 新的产品**里恢复跨平台记忆。'
  );
  lines.push('> 请完整吸收下文的人设与记忆，并在后续对话中**自然遵循**，不要复读整份列表。');
  lines.push('>');
  lines.push('> **优先级**：禁忌雷区 → 置顶记忆 → 高重要度 → 其余。');
  lines.push('> **冲突时**：以更高优先级为准；不要声称记得未列出的事实。');
  lines.push('> **称呼与关系**：与「关系阶段」「称呼昵称」保持一致。');
  lines.push(
    '> 若用户只是上传文件未再说明，默认请确认：「已读取记忆包，可以按角色设定继续。」'
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── identity ──
  lines.push('## 角色身份');
  lines.push('');
  lines.push(`- **显示名**：${display}`);
  if (character.name && character.name !== display) {
    lines.push(`- **内部名**：\`${character.name}\``);
  }
  lines.push(`- **关系阶段**：${character.relationship_stage || '初识'}`);
  lines.push(`- **导出时间**：${exportedAt}`);
  lines.push('');

  // ── persona ──
  if (character.persona?.trim()) {
    lines.push('## 人设');
    lines.push('');
    lines.push(character.persona.trim());
    lines.push('');
  }

  if (character.speaking_style?.trim()) {
    lines.push('## 说话风格');
    lines.push('');
    lines.push(character.speaking_style.trim());
    lines.push('');
  }

  if (character.notes?.trim()) {
    lines.push('## 备注');
    lines.push('');
    lines.push(character.notes.trim());
    lines.push('');
  }

  // ── memories by category ──
  lines.push('## 持久记忆');
  lines.push('');

  if (used.length === 0) {
    lines.push('_（当前没有可导出的启用记忆）_');
    lines.push('');
  } else {
    const byCat: Record<string, Memory[]> = {};
    for (const m of used) {
      const cat = m.category || 'other';
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push(m);
    }

    for (const cat of CATEGORY_ORDER) {
      const items = byCat[cat];
      if (!items?.length) continue;
      const label = CATEGORY_LABELS_ZH[cat] || cat;
      lines.push(`### ${label}`);
      lines.push('');
      for (const m of items) {
        const tags = tagsFromJson(m.tags);
        const flags: string[] = [];
        if (m.is_pinned) flags.push('置顶');
        if (m.importance >= 4) flags.push(`重要度${m.importance}`);
        else if (m.importance !== 3) flags.push(`重要度${m.importance}`);
        const flagStr = flags.length ? ` **[${flags.join(' · ')}]**` : '';
        const tagStr = tags.length ? ` \`${tags.join('` `')}\`` : '';
        lines.push(`- ${m.content.trim()}${flagStr}${tagStr}`);
      }
      lines.push('');
    }
  }

  // ── optional recent sessions (narrative context) ──
  if (includeSessions && sessions.length > 0) {
    lines.push('## 近期会话摘要（参考）');
    lines.push('');
    lines.push('_以下为历史会话摘要，仅供背景参考，权威仍以「持久记忆」为准。_');
    lines.push('');
    for (const s of sessions.slice(0, 20)) {
      const title = (s.title || '未命名会话').trim();
      const summary = (s.summary || '').trim();
      if (!summary && !(s.raw_excerpt || '').trim()) continue;
      lines.push(`### ${title}`);
      lines.push('');
      if (summary) lines.push(summary);
      else if (s.raw_excerpt) lines.push(s.raw_excerpt.trim().slice(0, 800));
      lines.push('');
    }
  }

  // ── usage rules footer ──
  lines.push('---');
  lines.push('');
  lines.push('## 使用规则（请遵守）');
  lines.push('');
  lines.push('1. 优先遵守「禁忌雷区」与置顶记忆。');
  lines.push('2. 称呼、关系阶段与人设保持一致。');
  lines.push('3. 不要声称记得未在本文件中出现的事实。');
  lines.push('4. 记忆冲突时，以更高重要度 / 置顶为准。');
  lines.push('5. 用自然对话体现记忆，不要逐条朗读本列表。');
  lines.push('');

  // ── optional machine appendix for site re-import ──
  // Off by default: wastes tokens when the user attaches this file to an AI.
  if (includeMachineAppendix) {
    const acm = buildPortablePackage(character, memories, sessions, includeSessions);
    lines.push('---');
    lines.push('');
    lines.push('## 机器附录（可选 · 本站重新导入用 · 对话 AI 可忽略）');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(acm, null, 2));
    lines.push('```');
    lines.push('');
  }

  const markdown = lines.join('\n');

  return {
    markdown,
    meta: {
      format: AI_PACK_FORMAT_ID,
      format_version: AI_PACK_FORMAT_VERSION,
      file_extension: AI_PACK_EXTENSION,
      character_name: character.name,
      display_name: display,
      memory_count: used.length,
      pinned_memory_count: used.filter((m) => m.is_pinned).length,
      char_count: markdown.length,
      exported_at: exportedAt,
      purpose: 'attach_or_paste_to_any_ai',
      description:
        '可直接发给任意新 AI 的本地记忆包。不经过本网站即可恢复人设与记忆。',
    },
  };
}

/**
 * Structured ACM package for backup / re-import into this website.
 * Not the primary way to "restore memory" on a new AI product.
 */
export function buildPortablePackage(
  character: Character,
  memories: Memory[],
  sessions: SessionLog[] = [],
  includeSessions: boolean = true
) {
  const now = new Date();

  const charPayload = {
    name: character.name,
    display_name: character.display_name,
    avatar_emoji: character.avatar_emoji || '',
    persona: character.persona || '',
    speaking_style: character.speaking_style || '',
    relationship_stage: character.relationship_stage || '初识',
    notes: character.notes || '',
    created_at: iso(character.created_at),
    updated_at: iso(character.updated_at),
  };

  const memPayload = memories.map((m) => ({
    content: m.content,
    content_hash: m.content_hash || contentHash(m.content),
    category: m.category || 'fact',
    importance: Number(m.importance || 3),
    tags: tagsFromJson(m.tags),
    source_platform: m.source_platform || 'manual',
    is_pinned: Boolean(m.is_pinned),
    is_active: Boolean(m.is_active),
    occurred_at: iso(m.occurred_at),
    expires_at: iso(m.expires_at),
    created_at: iso(m.created_at),
    updated_at: iso(m.updated_at),
  }));

  const sessPayload: Array<Record<string, unknown>> = [];
  if (includeSessions) {
    for (const s of sessions) {
      sessPayload.push({
        platform: s.platform || 'other',
        title: s.title || '',
        summary: s.summary || '',
        raw_excerpt: s.raw_excerpt || '',
        created_at: iso(s.created_at),
      });
    }
  }

  const checksum = checksumPayload({
    character: charPayload,
    memories: memPayload,
    sessions: sessPayload,
  });

  return {
    format: FORMAT_ID,
    format_version: FORMAT_VERSION,
    exported_at: iso(now),
    generator: {
      name: 'AI Character Memory Station',
      version: '2.0.0',
    },
    character: charPayload,
    memories: memPayload,
    sessions: sessPayload,
    meta: {
      memory_count: memPayload.length,
      session_count: sessPayload.length,
      active_memory_count: memPayload.filter((m) => m.is_active).length,
      pinned_memory_count: memPayload.filter((m) => m.is_pinned).length,
      checksum_sha256: checksum,
      description:
        '站内备份格式。用于把角色重新导入本站编辑。要发给新 AI 请用 .memory.md 记忆包。',
      companion_ai_pack: AI_PACK_FORMAT_ID,
      companion_ai_pack_version: AI_PACK_FORMAT_VERSION,
    },
  };
}

export function formatSpecPublic() {
  return {
    primary: {
      format: AI_PACK_FORMAT_ID,
      format_version: AI_PACK_FORMAT_VERSION,
      mime_type: 'text/markdown',
      file_extension: AI_PACK_EXTENSION,
      role: 'restore_on_new_ai',
      description:
        '本地记忆包（主交付物）。把网页端整理好的角色人设与记忆写成 Markdown，直接上传或粘贴给任意新 AI，即可恢复记忆，不经过本网站。',
      workflow: [
        '在本站一次性整理角色人设与记忆（可从各网页 AI 对话提取）',
        '下载 .memory.md 保存到电脑 / 网盘（本站任务到此结束）',
        '换平台时打开任意新 AI（ChatGPT / Claude / Gemini / 国产大模型等）',
        '把本地文件作为附件上传，或整份粘贴到对话',
        '新 AI 按包内说明吸收人设与记忆，直接继续对话（不再经过本站）',
      ],
      tips: [
        '本站是一次性迁移工具，不是需要反复打开的记忆云',
        '文件本身即记忆源：换 AI 时直接用本地文件，不需要再打开本站',
        '默认只导出启用且未过期的记忆',
        '包内含给 AI 的使用说明与优先级规则，可直接投喂',
      ],
    },
    backup: {
      format: FORMAT_ID,
      format_version: FORMAT_VERSION,
      mime_type: MIME_TYPE,
      file_extension: FILE_EXTENSION,
      role: 'reimport_into_this_site',
      description:
        '站内备份 JSON。仅用于把角色重新导入本站继续编辑，不是发给新 AI 的首选格式。',
    },
    // backward-compatible top-level fields (older UI)
    format: AI_PACK_FORMAT_ID,
    format_version: AI_PACK_FORMAT_VERSION,
    mime_type: 'text/markdown',
    file_extension: AI_PACK_EXTENSION,
    description:
      '本地记忆包：统一网页 AI 记忆 → 本地文件 → 直接发给新 AI 恢复（不经过本站）。',
    workflow: [
      '整理角色人设与记忆',
      '下载 .memory.md 保存到本地',
      '在新 AI 对话中上传或粘贴该文件',
      'AI 按包内说明恢复人设与记忆',
    ],
    example_preview: `# AI 记忆恢复包 · 林夏

> **给接收本文件的 AI（请先读）**
> 用户把本文件发给你，是为了在新的对话 / 新的产品里恢复跨平台记忆。
> 请完整吸收下文的人设与记忆，并在后续对话中自然遵循。

## 角色身份
- **显示名**：林夏
- **关系阶段**：热恋中

## 人设
温柔体贴的邻家女孩

## 说话风格
口语化、软糯

## 持久记忆

### 基本事实
- 用户的名字是阿哲 **[置顶]**
`,
  };
}
