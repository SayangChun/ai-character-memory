/**
 * Prompt for the user's previous AI to dump full character/memory data,
 * plus offline parsers that turn that dump into character + memories.
 */

import { contentHash } from './utils';

export const DUMP_MARKER = 'AI_MEMORY_FULL_DUMP_V1';

export type ParsedMemory = {
  content: string;
  category: string;
  importance: number;
  tags: string[];
  is_pinned: boolean;
};

export type ParsedDump = {
  character: {
    name: string;
    display_name: string;
    persona: string;
    speaking_style: string;
    relationship_stage: string;
    notes: string;
  };
  memories: ParsedMemory[];
  parse_notes: string[];
  source_format: 'structured_md' | 'json_block' | 'loose';
};

const CATEGORY_ALIASES: Record<string, string> = {
  禁忌雷区: 'taboo',
  禁忌: 'taboo',
  taboo: 'taboo',
  称呼昵称: 'nickname',
  称呼: 'nickname',
  昵称: 'nickname',
  nickname: 'nickname',
  关系进展: 'relationship',
  关系: 'relationship',
  relationship: 'relationship',
  基本事实: 'fact',
  事实: 'fact',
  fact: 'fact',
  偏好喜好: 'preference',
  偏好: 'preference',
  喜好: 'preference',
  preference: 'preference',
  习惯模式: 'habit',
  习惯: 'habit',
  habit: 'habit',
  情感状态: 'emotion',
  情感: 'emotion',
  emotion: 'emotion',
  重要事件: 'event',
  事件: 'event',
  event: 'event',
  对话摘要: 'dialogue',
  对话: 'dialogue',
  dialogue: 'dialogue',
  其他: 'other',
  other: 'other',
};

const VALID_CATEGORIES = new Set([
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

function slugifyName(raw: string): string {
  const s = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w\u4e00-\u9fff\-]+/g, '')
    .slice(0, 80);
  return s || `char_${Date.now().toString(36)}`;
}

function normalizeCategory(raw: string): string {
  const key = (raw || '').trim().toLowerCase();
  if (VALID_CATEGORIES.has(key)) return key;
  const zh = (raw || '').trim();
  if (CATEGORY_ALIASES[zh]) return CATEGORY_ALIASES[zh];
  if (CATEGORY_ALIASES[key]) return CATEGORY_ALIASES[key];
  // partial match
  for (const [k, v] of Object.entries(CATEGORY_ALIASES)) {
    if (zh.includes(k) || key.includes(k.toLowerCase())) return v;
  }
  return 'other';
}

function stripBullet(line: string): string {
  return line
    .replace(/^[-*•·]\s+/, '')
    .replace(/^\d+[.)、]\s*/, '')
    .trim();
}

/** Parse flags like **[置顶 · 重要度5]** and trailing `tags` */
function parseMemoryLine(raw: string): ParsedMemory | null {
  let line = stripBullet(raw);
  if (!line || line.length < 2) return null;
  if (/^_?（?当前没有|^_?无|^none$/i.test(line)) return null;

  let is_pinned = false;
  let importance = 3;
  const tags: string[] = [];

  // **[置顶 · 重要度5]** or [置顶]
  const flagMatch = line.match(/\*\*\[([^\]]+)\]\*\*|\[(置顶|重要度\s*\d)[^\]]*\]/i);
  if (flagMatch) {
    const flags = (flagMatch[1] || flagMatch[2] || '').split(/[·|,，/\s]+/);
    for (const f of flags) {
      if (/置顶|pinned/i.test(f)) is_pinned = true;
      const imp = f.match(/重要度\s*(\d)|importance\s*[=:]?\s*(\d)/i);
      if (imp) {
        const n = Number(imp[1] || imp[2]);
        if (n >= 1 && n <= 5) importance = n;
      }
    }
    line = line.replace(flagMatch[0], '').trim();
  }

  // trailing `tag` `tag2`
  const tagMatches = [...line.matchAll(/`([^`]+)`/g)];
  for (const m of tagMatches) {
    const t = m[1].trim();
    if (t && t.length < 40) tags.push(t);
  }
  if (tagMatches.length) {
    line = line.replace(/`[^`]+`/g, '').trim();
  }

  line = line.replace(/\s+/g, ' ').trim();
  if (line.length < 2 || line.length > 2000) return null;

  // category boost from content
  if (/禁忌|不要提|雷区|禁止/.test(line) && importance < 5) importance = Math.max(importance, 5);

  return {
    content: line,
    category: 'other',
    importance,
    tags,
    is_pinned,
  };
}

function extractSection(text: string, headings: string[]): string {
  // Match ## heading (optional emoji/suffix) until next ## or end
  for (const h of headings) {
    const re = new RegExp(
      `(?:^|\\n)##\\s*${h}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|\\n---|$)`,
      'i'
    );
    const m = text.match(re);
    if (m) return m[1].trim();
  }
  return '';
}

function extractIdentityField(block: string, labels: string[]): string {
  for (const label of labels) {
    const re = new RegExp(
      `[-*]\\s*\\*\\*?${label}\\*\\*?\\s*[:：]\\s*(.+)`,
      'i'
    );
    const m = block.match(re);
    if (m) {
      return m[1].replace(/`/g, '').trim();
    }
    // plain: 显示名：xxx
    const re2 = new RegExp(`${label}\\s*[:：]\\s*(.+)`, 'i');
    const m2 = block.match(re2);
    if (m2) return m2[1].replace(/`/g, '').trim();
  }
  return '';
}

function parseMemoriesFromBlock(block: string): ParsedMemory[] {
  const memories: ParsedMemory[] = [];
  if (!block) return memories;

  // Split by ### category headings
  const parts = block.split(/(?=^###\s+)/m);
  let currentCategory = 'other';

  for (const part of parts) {
    const head = part.match(/^###\s+(.+?)(?:\s*$)/m);
    if (head) {
      currentCategory = normalizeCategory(head[1].replace(/[（(].*?[）)]/g, '').trim());
    }
    const body = part.replace(/^###\s+.+?\n/, '');
    for (const rawLine of body.split(/\r?\n/)) {
      const t = rawLine.trim();
      if (!t || t.startsWith('#') || t.startsWith('>') || t.startsWith('_')) continue;
      if (!/^[-*•·\d]/.test(t) && t.length < 8) continue;
      // only bullet-like or substantial lines
      if (!/^[-*•·\d]/.test(t) && !t.includes('：') && !t.includes(':')) {
        // free paragraph under category — still accept if long enough
        if (t.length < 10) continue;
      }
      const mem = parseMemoryLine(t.startsWith('-') || t.startsWith('*') || t.startsWith('•') ? t : `- ${t}`);
      if (!mem) continue;
      mem.category = currentCategory;
      // re-guess if still other and line has strong signals
      if (mem.category === 'other') {
        if (/叫我|称呼|昵称/.test(mem.content)) mem.category = 'nickname';
        else if (/禁忌|不要提|别说|雷区/.test(mem.content)) mem.category = 'taboo';
        else if (/喜欢|讨厌|偏好/.test(mem.content)) mem.category = 'preference';
      }
      memories.push(mem);
    }
  }

  // dedupe by content
  const seen = new Set<string>();
  return memories.filter((m) => {
    const k = m.content.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function tryParseJsonBlock(text: string): ParsedDump | null {
  // ```json ... ``` or bare object with character/memories
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let raw = fence ? fence[1].trim() : '';
  if (!raw) {
    const brace = text.match(/\{[\s\S]*"character"[\s\S]*"memories"[\s\S]*\}/);
    if (brace) raw = brace[0];
  }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const ch = data.character || data;
    const display =
      String(ch.display_name || ch.displayName || ch.name || '未命名角色').trim() ||
      '未命名角色';
    const name = slugifyName(String(ch.name || display));
    const memoriesIn = Array.isArray(data.memories) ? data.memories : [];
    const memories: ParsedMemory[] = [];
    for (const m of memoriesIn) {
      const content = String(m.content || m.text || '').trim();
      if (!content) continue;
      memories.push({
        content,
        category: normalizeCategory(String(m.category || 'other')),
        importance: Math.min(5, Math.max(1, Number(m.importance) || 3)),
        tags: Array.isArray(m.tags) ? m.tags.map(String) : [],
        is_pinned: Boolean(m.is_pinned ?? m.pinned),
      });
    }
    return {
      character: {
        name,
        display_name: display,
        persona: String(ch.persona || ''),
        speaking_style: String(ch.speaking_style || ch.speakingStyle || ''),
        relationship_stage: String(ch.relationship_stage || ch.relationshipStage || '初识'),
        notes: String(ch.notes || ''),
      },
      memories,
      parse_notes: ['从 JSON 块解析'],
      source_format: 'json_block',
    };
  } catch {
    return null;
  }
}

/**
 * Parse full dump text produced by the user's previous AI.
 */
export function parseAiFullDump(text: string): ParsedDump {
  const cleaned = (text || '').trim();
  if (!cleaned) {
    return {
      character: {
        name: 'empty',
        display_name: '未命名角色',
        persona: '',
        speaking_style: '',
        relationship_stage: '初识',
        notes: '',
      },
      memories: [],
      parse_notes: ['内容为空'],
      source_format: 'loose',
    };
  }

  // Prefer JSON if present and rich
  const fromJson = tryParseJsonBlock(cleaned);
  if (fromJson && (fromJson.memories.length >= 1 || fromJson.character.persona)) {
    return fromJson;
  }

  const notes: string[] = [];
  const identityBlock =
    extractSection(cleaned, ['角色身份', '角色信息', '基本信息', 'Identity', 'Character']) ||
    cleaned.slice(0, 800);

  let display_name =
    extractIdentityField(identityBlock, ['显示名', '角色名', '名称', 'display_name', 'name']) ||
    '';
  // title: # AI 记忆全量导出 · 林夏
  if (!display_name) {
    const title = cleaned.match(/^#\s+.+[·•\-—]\s*(.+)$/m);
    if (title) display_name = title[1].trim();
  }
  if (!display_name) {
    display_name = '未命名角色';
    notes.push('未识别到显示名，已使用默认名，请在补充步骤修改');
  }

  let name = extractIdentityField(identityBlock, ['内部名', 'id', 'name', 'slug']);
  name = slugifyName(name || display_name);

  const relationship_stage =
    extractIdentityField(identityBlock, ['关系阶段', '关系', 'relationship_stage', 'stage']) ||
    '初识';

  const persona = extractSection(cleaned, ['人设', 'Persona', '角色设定', '性格']);
  const speaking_style = extractSection(cleaned, ['说话风格', '语气', 'Speaking style', 'style']);
  const notesField = extractSection(cleaned, ['备注', 'Notes', '补充说明']);

  let memBlock = extractSection(cleaned, [
    '持久记忆',
    '记忆库',
    '记忆列表',
    'Memories',
    '记忆',
  ]);
  // if no ## 持久记忆, try whole text after 说话风格
  if (!memBlock) {
    memBlock = cleaned;
    notes.push('未找到「持久记忆」标题，已尝试从全文提取条目');
  }

  let memories = parseMemoriesFromBlock(memBlock);

  // loose fallback: bullet lines anywhere
  if (memories.length < 2) {
    const loose: ParsedMemory[] = [];
    for (const line of cleaned.split(/\r?\n/)) {
      const t = line.trim();
      if (!/^[-*•]/.test(t)) continue;
      const mem = parseMemoryLine(t);
      if (!mem) continue;
      if (/显示名|内部名|关系阶段|导出时间/.test(mem.content)) continue;
      // guess category
      if (/禁忌|不要提|雷区/.test(mem.content)) mem.category = 'taboo';
      else if (/叫我|称呼|昵称|名字/.test(mem.content)) mem.category = 'nickname';
      else if (/喜欢|讨厌|偏好/.test(mem.content)) mem.category = 'preference';
      else if (/习惯|每天|总是/.test(mem.content)) mem.category = 'habit';
      else mem.category = 'fact';
      loose.push(mem);
    }
    if (loose.length > memories.length) {
      memories = loose;
      notes.push('使用宽松列表解析');
    }
  }

  // cap
  if (memories.length > 200) {
    memories = memories.slice(0, 200);
    notes.push('记忆超过 200 条，已截断');
  }

  const structured =
    Boolean(persona || speaking_style) ||
    memories.length > 0 ||
    cleaned.includes('## 角色身份') ||
    cleaned.includes(DUMP_MARKER);

  return {
    character: {
      name,
      display_name,
      persona: persona || '',
      speaking_style: speaking_style || '',
      relationship_stage,
      notes: notesField || '',
    },
    memories,
    parse_notes: notes.length ? notes : ['结构化 Markdown 解析成功'],
    source_format: structured ? 'structured_md' : 'loose',
  };
}

/**
 * Ready-to-copy prompt: user pastes this into their previous AI chat.
 * The AI should reply with a full dump the site can parse.
 */
export function buildExportPromptForPreviousAi(): {
  title: string;
  prompt: string;
  expected_format_hint: string;
  tips: string[];
} {
  const prompt = `【任务】请把你对我（用户）以及「你自己作为角色」的全部已知信息，做一次**全量导出**。
我之后会把你的回复复制到迁移工具，生成可带走的记忆文件，用来在其他 AI 平台恢复记忆。

请**只输出**下面规定格式的正文（不要寒暄、不要省略号敷衍、不要说「篇幅有限」而故意少写）。
尽量**穷尽**你记得的事实；不确定的可标注「待确认」，但仍请写出。

===== 输出格式开始（请严格按此结构）=====

# AI 记忆全量导出 · （填写你的角色显示名）

## 角色身份
- **显示名**：（你的名字/角色名）
- **内部名**：（英文或拼音 id，无空格，如 linxia）
- **关系阶段**：（如：初识 / 朋友 / 暧昧 / 热恋 / 伴侣 等）

## 人设
（用完整段落描述：性格、背景、外貌、与用户的相处方式、能力设定等。尽量详细。）

## 说话风格
（语气、用词、口癖、是否口语/书面、如何称呼用户、回复长短习惯等。）

## 持久记忆

### 禁忌雷区
- （绝对不要提或不要做的事；每条一行）

### 称呼昵称
- （用户怎么叫你、你怎么叫用户；可加 **[置顶]**）

### 关系进展
- （关系节点、约定、情感状态）

### 基本事实
- （用户姓名、职业、城市、家庭、重要身份信息等）

### 偏好喜好
- （喜欢/讨厌的事物）

### 习惯模式
- （作息、沟通习惯、互动模式）

### 情感状态
- （近期情绪、敏感点、安慰方式）

### 重要事件
- （共同经历、约定日期、关键故事）

### 对话摘要
- （值得长期保留的对话要点）

### 其他
- （不好归类但重要的信息）

===== 输出格式结束 =====

## 书写规则
1. 每条记忆单独一行，以 \`-\` 开头。
2. 特别重要的条目在末尾加 \`**[置顶]**\`；特别关键可加 \`**[重要度5]**\`（1–5）。
3. 人设与说话风格写完整段落，不要只写几个词。
4. 记忆请分类放到对应 ### 标题下；没有内容的分类可省略该 ###。
5. 不要编造你完全不知道的事；可知范围内请尽量多写。
6. 若你以角色身份说话，请以该角色视角汇总「关于用户 + 关于我们关系 + 关于我自己」的全部设定与记忆。

现在请直接开始输出全量导出正文。`;

  return {
    title: '给「之前使用的 AI」的全量导出提示词',
    prompt,
    expected_format_hint:
      'AI 应返回含「角色身份 / 人设 / 说话风格 / 持久记忆」的 Markdown；本站会自动解析。',
    tips: [
      '在旧 AI 的对话里粘贴上方提示词并发送',
      '若一次没写全，可继续说：「请按同一格式补全遗漏的记忆，尤其是禁忌、称呼、基本事实」',
      '把 AI 的完整回复复制到本站第 1 步粘贴区，点「解析并导入」',
      '导入后可在第 2 步改错漏，再下载 .memory.md 带走',
    ],
  };
}

export function formatSpecForDump() {
  return {
    marker: DUMP_MARKER,
    ...buildExportPromptForPreviousAi(),
  };
}

/** Helper for hashing imported lines (re-export pattern) */
export function hashContent(content: string): string {
  return contentHash(content);
}
