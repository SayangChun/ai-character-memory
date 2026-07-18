/**
 * Lightweight offline extraction of memory candidates from pasted chat text.
 * Heuristic only — no external LLM required.
 */

export type SuggestItem = {
  content: string;
  category: string;
  importance: number;
  tags: string[];
};

const CATEGORY_HINTS: Array<{ category: string; patterns: RegExp[]; importance: number }> = [
  {
    category: 'taboo',
    patterns: [/禁忌|不要提|别说|雷区|敏感|禁止|别叫|不要叫/i],
    importance: 5,
  },
  {
    category: 'nickname',
    patterns: [/叫我|称呼|昵称|名字是|我叫|你叫我|叫你/i],
    importance: 5,
  },
  {
    category: 'relationship',
    patterns: [/恋爱|交往|在一起|分手|关系|喜欢你|爱你|男朋友|女朋友|暧昧/i],
    importance: 4,
  },
  {
    category: 'preference',
    patterns: [/喜欢|讨厌|偏好|最爱|不爱|爱吃|爱看|爱玩|口味/i],
    importance: 3,
  },
  {
    category: 'habit',
    patterns: [/习惯|每天|总是|经常|通常|作息|起床|睡觉/i],
    importance: 3,
  },
  {
    category: 'emotion',
    patterns: [/难过|开心|伤心|焦虑|害怕|温柔|体贴|情绪/i],
    importance: 3,
  },
  {
    category: 'event',
    patterns: [/那天|上次|昨天|今天|记得.*时候|发生|见面|约会/i],
    importance: 3,
  },
  {
    category: 'fact',
    patterns: [/是|住在|工作|学校|年龄|生日|职业|来自/i],
    importance: 3,
  },
];

function guessCategory(line: string): { category: string; importance: number } {
  for (const h of CATEGORY_HINTS) {
    if (h.patterns.some((p) => p.test(line))) {
      return { category: h.category, importance: h.importance };
    }
  }
  return { category: 'dialogue', importance: 2 };
}

function cleanLine(raw: string): string {
  return raw
    .replace(/^(用户|User|Human|助手|Assistant|AI|Bot|角色)[:：\s]+/i, '')
    .replace(/^[-*•\d.)、]+\s*/, '')
    .trim();
}

export function suggestMemoriesFromText(
  text: string,
  options: { default_category?: string; default_importance?: number } = {}
): SuggestItem[] {
  const defaultCategory = options.default_category || 'dialogue';
  const defaultImportance = options.default_importance ?? 3;

  const lines = text
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((l) => l.length >= 6 && l.length <= 500);

  const seen = new Set<string>();
  const out: SuggestItem[] = [];

  for (const line of lines) {
    // skip pure UI chrome / timestamps
    if (/^(https?:\/\/|www\.)/i.test(line)) continue;
    if (/^\d{1,2}:\d{2}/.test(line)) continue;
    if (/^(复制|分享|重新生成|Continue|Regenerate)/i.test(line)) continue;

    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const guessed = guessCategory(line);
    const category =
      guessed.category === 'dialogue' && defaultCategory ? defaultCategory : guessed.category;

    out.push({
      content: line,
      category,
      importance: guessed.category === 'dialogue' ? defaultImportance : guessed.importance,
      tags: ['imported'],
    });

    if (out.length >= 40) break;
  }

  // If almost nothing, take longer paragraphs
  if (out.length < 3) {
    const paras = text
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter((p) => p.length >= 12 && p.length <= 400);
    for (const p of paras) {
      const key = p.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const guessed = guessCategory(p);
      out.push({
        content: p,
        category: guessed.category,
        importance: guessed.importance,
        tags: ['imported'],
      });
      if (out.length >= 20) break;
    }
  }

  return out;
}
