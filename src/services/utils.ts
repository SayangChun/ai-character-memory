import crypto from 'crypto';

export function contentHash(text: string): string {
  const normalized = text
    .trim()
    .split(/\s+/)
    .join(' ')
    .toLowerCase();
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function tagsToJson(tags: string[] | null | undefined): string {
  const cleaned = (tags || [])
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const seen = new Set<string>();
  const unique: string[] = [];

  for (const t of cleaned) {
    const key = t.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(t);
    }
  }

  return JSON.stringify(unique);
}

export function tagsFromJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      return data.map((x) => String(x));
    }
  } catch (e) {
    // ignore parse error
  }
  return [];
}

export function isExpired(
  expiresAt: Date | string | null | undefined,
  now?: Date
): boolean {
  if (!expiresAt) return false;
  const exp = new Date(expiresAt);
  if (isNaN(exp.getTime())) return false;

  const currentTime = now || new Date();
  return exp.getTime() < currentTime.getTime();
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // basic check for CJK unified ideographs
    if (code >= 0x4e00 && code <= 0x9fff) {
      cjk++;
    }
  }
  const other = text.length - cjk;
  return Math.max(1, Math.floor(cjk / 1.5 + other / 4));
}
