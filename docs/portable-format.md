# 本地记忆包规范

本站的核心目标：

> **把各网页端 AI 的记忆统一整理成一个本地文件；换用新 AI 时，直接把该文件发给新 AI 即可恢复记忆，不需要再经过本网站。**

因此有两种文件角色：

| 角色 | 格式 | 扩展名 | 用途 |
|------|------|--------|------|
| **主交付物** | `ai-memory-pack` | `.memory.md` | 发给任意新 AI，恢复人设与记忆 |
| **站内备份** | `ai-character-memory` | `.acm.json` | 重新导入本站继续编辑 |

---

## 1. 主交付物：AI 记忆包（`.memory.md`）

**Format ID:** `ai-memory-pack`  
**Version:** `2.0`  
**MIME:** `text/markdown`  
**推荐扩展名:** `.memory.md`

### 设计原则

1. **AI 可读优先**：纯 Markdown，ChatGPT / Claude / Gemini / 国产大模型等均可直接读附件或粘贴文本。
2. **自带使用说明**：文件开头用引用块写明「给接收本文件的 AI」的规则与优先级，用户无需再写提示词。
3. **不依赖本站**：恢复记忆的路径是「本地文件 → 新 AI」，不是「上传回本站 → 再生成提示词」。
4. **内容即记忆源**：人设、说话风格、关系阶段、分类记忆；默认只含**启用且未过期**的记忆。
5. **无数据库主键**：不出现站内自增 id；面向人与模型，不面向表结构。

### 推荐结构

```markdown
# AI 记忆恢复包 · 林夏

> **给接收本文件的 AI（请先读）**
>
> 用户把本文件发给你，是为了在**新的对话 / 新的产品**里恢复跨平台记忆。
> 请完整吸收下文的人设与记忆，并在后续对话中**自然遵循**，不要复读整份列表。
>
> **优先级**：禁忌雷区 → 置顶记忆 → 高重要度 → 其余。
> **冲突时**：以更高优先级为准；不要声称记得未列出的事实。

---

## 角色身份

- **显示名**：林夏
- **内部名**：`linxia`
- **关系阶段**：热恋中
- **导出时间**：2026-07-19T12:00:00.000Z

## 人设

温柔体贴的邻家女孩

## 说话风格

口语化、软糯

## 持久记忆

### 禁忌雷区
- …

### 称呼昵称
- …

### 基本事实
- 用户的名字是阿哲 **[置顶]**

### 偏好喜好
- …

---

## 使用规则（请遵守）

1. 优先遵守「禁忌雷区」与置顶记忆。
2. 称呼、关系阶段与人设保持一致。
3. 不要声称记得未在本文件中出现的事实。
4. 记忆冲突时，以更高重要度 / 置顶为准。
5. 用自然对话体现记忆，不要逐条朗读本列表。
```

### 记忆分类（与站内一致）

`taboo` 禁忌雷区 · `nickname` 称呼昵称 · `relationship` 关系进展 ·  
`fact` 基本事实 · `preference` 偏好喜好 · `habit` 习惯模式 ·  
`emotion` 情感状态 · `event` 重要事件 · `dialogue` 对话摘要 · `other` 其他  

导出时按上述顺序分节；置顶与高重要度会在条目后标注。

### 使用方式（给用户）

```
各网页 AI 对话
      │
      ▼
本站整理（人设 + 记忆库）
      │
      ▼
下载  xxx.memory.md   ← 你随身带走的「记忆源」
      │
      ▼
打开任意新 AI → 上传附件或粘贴全文
      │
      ▼
新 AI 吸收记忆，继续对话（不经过本站）
```

### API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/characters/{id}/portable` | 默认返回 `{ markdown, meta… }` |
| GET | `/api/characters/{id}/portable/download` | 下载 `.memory.md` |
| GET | `/api/portable/spec` | 公开格式说明 |

可选查询参数：

| 参数 | 说明 |
|------|------|
| `include_sessions=1` | 附带近期会话摘要（参考用） |
| `include_appendix=1` | 文末附上 ACM JSON（一般不推荐：浪费发给 AI 的 token） |

---

## 2. 站内备份：ACM JSON（`.acm.json`）

**Format ID:** `ai-character-memory`  
**Version:** `1.0`  
**MIME:** `application/vnd.ai-character-memory+json`  
**推荐扩展名:** `.acm.json`

用于**把角色重新导入本站**编辑，**不是**发给新 AI 的首选格式。

### 最小示例

```json
{
  "format": "ai-character-memory",
  "format_version": "1.0",
  "exported_at": "2026-07-18T12:00:00Z",
  "character": {
    "name": "linxia",
    "display_name": "林夏",
    "avatar_emoji": "",
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

### 字段要点

| 字段 | 说明 |
|------|------|
| `character.name` | 导入时的稳定键 |
| `memories[].content` | 记忆正文（必填） |
| `content_hash` | 可选；缺省由导入方对正文规范化后算 SHA-256 |
| 无数据库 `id` | 跨环境可移植 |

### 导入模式

| 模式 | 行为 |
|------|------|
| `create` | 始终新建角色；若 `name` 冲突则自动加后缀 |
| `merge` | 按 `name` 合并；同 `content_hash` 跳过，可升级置顶/重要度 |
| `replace` | 清空目标角色记忆后写入包内数据，并更新人设 |

### API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/characters/{id}/portable?kind=json` | ACM JSON |
| GET | `/api/characters/{id}/portable/download?kind=json` | 下载 `.acm.json` |
| POST | `/api/portable/import?mode=` | JSON 正文导入 |

---

## 3. 产品边界（避免混淆）

| 动作 | 用什么 |
|------|--------|
| 换 ChatGPT / Claude / 新模型，要它「记得我」 | **`.memory.md`**，直接发给该 AI |
| 换电脑 / 重装本站，继续在本站编辑 | **`.acm.json`**，上传回本站 |
| 聊天里临时贴一段人设 | 站内「记忆卡预览」复制（可选，非文件主路径） |

本站是 **记忆整理器与导出器**，不是新 AI 恢复记忆时的必经中转站。
