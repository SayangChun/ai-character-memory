import { Character, Memory, SessionLog } from '@prisma/client';
import crypto from 'crypto';
import { contentHash, tagsFromJson } from './utils';

export const FORMAT_ID = 'ai-character-memory';
export const FORMAT_VERSION = '1.0';
export const MIME_TYPE = 'application/vnd.ai-character-memory+json';
export const FILE_EXTENSION = '.acm.json';

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

export function checksumPayload(body: any): string {
  const raw = JSON.stringify(body);
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

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
    avatar_emoji: character.avatar_emoji || '💖',
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

  const sessPayload: any[] = [];
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
      version: '1.0.0',
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
      description: `Portable AI character memory package. Upload this file on another platform that supports ${FORMAT_ID} v${FORMAT_VERSION} to restore persona and memories.`,
    },
  };
}

export function formatSpecPublic() {
  return {
    format: FORMAT_ID,
    format_version: FORMAT_VERSION,
    mime_type: MIME_TYPE,
    file_extension: FILE_EXTENSION,
    description:
      '跨平台 AI 角色记忆可移植包格式说明。下载 .acm.json 后可在任意支持该格式的工具中上传恢复。',
    workflow: [
      '在本站整理角色人设与记忆',
      '点击「下载 .acm.json」保存到本地 / 网盘',
      '换平台或换设备时，上传该文件即可恢复人设与记忆库',
      '记忆以 character.name + content_hash 识别，不含数据库自增 id',
    ],
    example_minimal: {
      format: FORMAT_ID,
      format_version: FORMAT_VERSION,
      character: {
        name: 'linxia',
        display_name: '林夏',
        avatar_emoji: '🌸',
        persona: '温柔体贴的邻家女孩',
        speaking_style: '口语化、软糯',
        relationship_stage: '热恋中',
      },
      memories: [
        {
          content: '用户的名字是阿哲',
          category: 'fact',
          importance: 5,
          tags: ['用户信息'],
          source_platform: 'manual',
          is_pinned: true,
          is_active: true,
        },
      ],
      sessions: [],
    },
  };
}
