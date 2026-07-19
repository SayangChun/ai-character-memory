import { Character, Memory } from '@prisma/client';
import { estimateTokens, isExpired, tagsFromJson } from './utils';

export const CATEGORY_LABELS_ZH: Record<string, string> = {
  fact: '基本事实',
  preference: '偏好喜好',
  event: '重要事件',
  emotion: '情感状态',
  relationship: '关系进展',
  habit: '习惯模式',
  taboo: '禁忌雷区',
  nickname: '称呼昵称',
  dialogue: '对话摘要',
  other: '其他',
};

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

type ContextFormat = 'universal' | 'system_prompt' | 'compact' | 'json';

function sortMemories(memories: Memory[], pinnedFirst: boolean): Memory[] {
  return [...memories].sort((a, b) => {
    if (pinnedFirst) {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
    }
    if (a.importance !== b.importance) {
      return b.importance - a.importance;
    }
    const aTime = a.updated_at ? a.updated_at.getTime() : 0;
    const bTime = b.updated_at ? b.updated_at.getTime() : 0;
    return bTime - aTime;
  });
}

function filterMemories(
  memories: Memory[],
  options: {
    includeInactive: boolean;
    minImportance: number;
    categories?: string[] | null;
  }
): Memory[] {
  const now = new Date();
  return memories.filter((m) => {
    if (!options.includeInactive && !m.is_active) return false;
    if (isExpired(m.expires_at, now)) return false;
    if (m.importance < options.minImportance) return false;
    if (options.categories && options.categories.length > 0 && !options.categories.includes(m.category)) {
      return false;
    }
    return true;
  });
}

function memoryLine(m: Memory, compact: boolean = false): string {
  const tags = tagsFromJson(m.tags);
  const pin = m.is_pinned ? '[置顶] ' : '';
  if (compact) {
    return `- ${pin}${m.content}`;
  }
  const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
  return `- ${pin}[重要度${m.importance}] ${m.content}${tagStr}`;
}

export function buildContext(
  character: Character,
  memories: Memory[],
  options: {
    fmt?: ContextFormat;
    maxChars?: number;
    includePersona?: boolean;
    includeInactive?: boolean;
    minImportance?: number;
    categories?: string[] | null;
    pinnedFirst?: boolean;
  } = {}
) {
  const fmt = options.fmt || 'universal';
  const maxChars = options.maxChars || 6000;
  const includePersona = options.includePersona ?? true;
  const includeInactive = options.includeInactive ?? false;
  const minImportance = options.minImportance ?? 1;
  const categories = options.categories || null;
  const pinnedFirst = options.pinnedFirst ?? true;

  const filtered = filterMemories(memories, { includeInactive, minImportance, categories });
  const ordered = sortMemories(filtered, pinnedFirst);

  let content = '';
  let used: Memory[] = [];
  let truncated = false;

  if (fmt === 'json') {
    content = buildJson(character, ordered, includePersona);
    used = ordered;
  } else {
    const res = buildText(character, ordered, { fmt, maxChars, includePersona });
    content = res.content;
    used = res.used;
    truncated = res.truncated;
  }

  return {
    character_id: character.id,
    character_name: character.display_name,
    format: fmt,
    content,
    char_count: content.length,
    memory_count: used.length,
    truncated,
    estimated_tokens: estimateTokens(content),
  };
}

function buildJson(character: Character, memories: Memory[], includePersona: boolean): string {
  const payload: any = {
    character: {
      name: character.name,
      display_name: character.display_name,
      relationship_stage: character.relationship_stage,
    },
    memories: memories.map((m) => ({
      content: m.content,
      category: m.category,
      importance: m.importance,
      pinned: m.is_pinned,
      tags: tagsFromJson(m.tags),
    })),
  };

  if (includePersona) {
    payload.character.persona = character.persona;
    payload.character.speaking_style = character.speaking_style;
  }

  return JSON.stringify(payload, null, 2);
}

function buildText(
  character: Character,
  memories: Memory[],
  options: { fmt: string; maxChars: number; includePersona: boolean }
) {
  const { fmt, maxChars, includePersona } = options;
  const headerParts: string[] = [];

  if (fmt === 'system_prompt') {
    headerParts.push(`你正在扮演角色「${character.display_name}」。请始终保持人设一致，并严格遵守下列记忆。`);
  } else if (fmt === 'compact') {
    headerParts.push(`[角色:${character.display_name}|关系:${character.relationship_stage}]`);
  } else {
    headerParts.push(`# 角色记忆卡：${character.display_name}`);
    headerParts.push(`> 关系阶段：${character.relationship_stage}  |  内部名：${character.name}`);
    headerParts.push(`以下为该角色的持久记忆。请在对话中自然引用，不要生硬复读列表。`);
  }

  if (includePersona && character.persona && fmt !== 'compact') {
    headerParts.push('\n## 人设 / Persona');
    headerParts.push(character.persona.trim());
  }

  if (includePersona && character.speaking_style && fmt !== 'compact') {
    headerParts.push('\n## 说话风格');
    headerParts.push(character.speaking_style.trim());
  }

  const header = headerParts.join('\n').replace(/\s+$/, '') + '\n';
  let footer = '';

  if (['universal', 'system_prompt'].includes(fmt)) {
    footer =
      '\n---\n使用规则：\n1. 优先遵守「禁忌雷区」与置顶记忆。\n2. 称呼与关系阶段需与记忆一致。\n3. 不要声称记得未列出的事实。\n4. 记忆有冲突时，以更高重要度 / 置顶为准。\n';
  }

  let budget = maxChars - header.length - footer.length;
  if (budget < 200) budget = 200;

  const used: Memory[] = [];
  let truncated = false;
  const bodyParts: string[] = [];
  let usedChars = 0;

  if (fmt === 'compact') {
    for (const m of memories) {
      const line = memoryLine(m, true) + '\n';
      if (usedChars + line.length > budget) {
        truncated = true;
        break;
      }
      bodyParts.push(line);
      usedChars += line.length;
      used.push(m);
    }
  } else {
    const byCat: Record<string, Memory[]> = {};
    for (const m of memories) {
      if (!byCat[m.category]) byCat[m.category] = [];
      byCat[m.category].push(m);
    }

    for (const cat of CATEGORY_ORDER) {
      const items = byCat[cat] || [];
      if (items.length === 0) continue;

      const label = CATEGORY_LABELS_ZH[cat] || cat;
      const sectionHeader = `\n## ${label}\n`;
      if (usedChars + sectionHeader.length > budget) {
        truncated = true;
        break;
      }

      const sectionLines = [sectionHeader];
      let sectionLen = sectionHeader.length;
      const sectionUsed: Memory[] = [];

      for (const m of items) {
        const line = memoryLine(m, false) + '\n';
        if (usedChars + sectionLen + line.length > budget) {
          truncated = true;
          break;
        }
        sectionLines.push(line);
        sectionLen += line.length;
        sectionUsed.push(m);
      }

      if (sectionUsed.length > 0) {
        bodyParts.push(...sectionLines);
        usedChars += sectionLen;
        used.push(...sectionUsed);
      }

      if (truncated) break;
    }
  }

  if (truncated) {
    bodyParts.push('\n…（已达长度上限，部分低优先级记忆已省略）\n');
  }

  return {
    content: header + bodyParts.join('') + footer,
    used,
    truncated,
  };
}
