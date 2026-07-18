# AI Character Memory 可移植格式（ACM）

**Format ID:** `ai-character-memory`  
**Version:** `1.0`  
**推荐扩展名:** `.acm.json`  
**MIME:** `application/vnd.ai-character-memory+json`

## 设计目标

- **本地文件是跨平台源**：在 A 处整理 → 下载 → 到 B 处上传恢复。
- **不依赖访问导出网站**：换平台时只需持有文件。
- **无数据库主键**：包内不含 `id`，以 `character.name` 与 `content_hash` 识别。
- **自描述**：根级 `format` + `format_version` 便于第三方解析。

## 最小示例

```json
{
  "format": "ai-character-memory",
  "format_version": "1.0",
  "exported_at": "2026-07-18T12:00:00Z",
  "character": {
    "name": "linxia",
    "display_name": "林夏",
    "avatar_emoji": "🌸",
    "persona": "温柔体贴的邻家女孩",
    "speaking_style": "口语化、软糯",
    "relationship_stage": "热恋中",
    "notes": ""
  },
  "memories": [
    {
      "content": "用户的名字是阿哲",
      "category": "fact",
      "importance": 5,
      "tags": ["用户信息"],
      "source_platform": "manual",
      "is_pinned": true,
      "is_active": true
    }
  ],
  "sessions": [],
  "meta": {
    "memory_count": 1
  }
}
```

## 字段说明

### 根对象

| 字段 | 必需 | 说明 |
|------|------|------|
| `format` | 是 | 固定 `ai-character-memory` |
| `format_version` | 是 | 语义化版本，当前 `1.0` |
| `exported_at` | 否 | ISO-8601 UTC |
| `generator` | 否 | `{ name, version }` |
| `character` | 是 | 角色对象 |
| `memories` | 是 | 记忆数组（可空） |
| `sessions` | 否 | 会话摘要（可空） |
| `meta` | 否 | 统计与校验信息 |

### character

| 字段 | 必需 | 说明 |
|------|------|------|
| `name` | 是 | 稳定内部名（跨平台主键候选） |
| `display_name` | 是 | 展示名 |
| `avatar_emoji` | 否 | 默认 💖 |
| `persona` | 否 | 人设正文 |
| `speaking_style` | 否 | 说话风格 |
| `relationship_stage` | 否 | 关系阶段 |
| `notes` | 否 | 备注 |

### memories[]

| 字段 | 必需 | 说明 |
|------|------|------|
| `content` | 是 | 记忆正文 |
| `content_hash` | 否 | 规范化后 SHA-256；缺省时由导入方计算 |
| `category` | 否 | 见下方分类 |
| `importance` | 否 | 1–5，默认 3 |
| `tags` | 否 | 字符串数组 |
| `source_platform` | 否 | 来源平台 id |
| `is_pinned` / `is_active` | 否 | 布尔 |
| `occurred_at` / `expires_at` | 否 | 时间 |

### 分类 category

`fact` · `preference` · `event` · `emotion` · `relationship` · `habit` · `taboo` · `nickname` · `dialogue` · `other`

## 导入语义建议

| 模式 | 行为 |
|------|------|
| `create` | 始终新建角色；若 `name` 冲突则自动加后缀 |
| `merge` | 按 `name`（或指定 id）合并；同 `content_hash` 跳过，可升级置顶/重要度 |
| `replace` | 清空目标角色记忆后写入包内数据，并更新人设 |

## 本站 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/portable/spec` | 公开格式说明 |
| GET | `/api/characters/{id}/portable` | 获取 ACM JSON |
| GET | `/api/characters/{id}/portable/download` | 下载 `.acm.json` 文件 |
| POST | `/api/portable/import?mode=` | JSON 正文导入 |
| POST | `/api/portable/import/file?mode=` | multipart 文件上传 |

在线文档：`/docs`
