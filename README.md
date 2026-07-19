# AI 角色记忆站

把**各网页端 AI 的记忆**统一整理成**本地文件**。  
换用新 AI 时，**直接把该文件发给新 AI** 即可恢复记忆——**不经过本网站**。

---

## 两种本地文件

| 文件 | 用途 |
|------|------|
| **`.memory.md`**（主） | 发给任意新 AI，恢复人设与记忆 |
| **`.acm.json`**（辅） | 重新导入本站继续编辑 |

规范详见 [docs/portable-format.md](docs/portable-format.md)。

---

## 两种本地文件

| 文件 | 用途 |
|------|------|
| **`.memory.md`**（主） | 发给任意新 AI，恢复人设与记忆 |
| **`.acm.json`**（辅） | 重新导入本站继续编辑 |

规范详见 [docs/portable-format.md](docs/portable-format.md)。

---

## 快速开始

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

浏览器打开：http://127.0.0.1:8765  

1. 创建角色或「加载演示角色」  
2. 添加记忆（或从对话文本提取）  
3. **下载 .memory.md**  
4. 在新 AI 里上传 / 粘贴该文件 → 恢复记忆  

需要换设备继续在本站编辑时，再下载 / 上传 **`.acm.json`** 站内备份。

---

## 主格式：AI 记忆包 v2（`.memory.md`）

- **Format:** `ai-memory-pack`  
- **扩展名:** `.memory.md`  
- **在线说明:** `GET /api/portable/spec`

文件开头自带「给接收本文件的 AI」说明与优先级规则，可直接投喂：

```markdown
# AI 记忆恢复包 · 林夏

> **给接收本文件的 AI（请先读）**
> 用户把本文件发给你，是为了在新的对话里恢复跨平台记忆。
> …

## 人设
…

## 持久记忆
### 基本事实
- 用户的名字是阿哲 **[置顶]**
```

---

## 功能一览

- **角色**：人设、说话风格、关系阶段  
- **记忆**：分类、置顶、重要度、标签  
- **本地记忆包**：下载 `.memory.md` / 复制全文 / 站内备份 `.acm.json`  
- **对话提取**：粘贴网页 AI 对话 → 规则建议 → 入库  
- **记忆卡快贴**：可选的更短提示词片段  

---

## API 摘要

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/site` | 站点配置 |
| GET | `/api/portable/spec` | 记忆包格式说明 |
| * | `/api/characters…` | 角色与记忆 |
| GET | `/api/characters/{id}/portable` | 默认返回 Markdown 记忆包 |
| GET | `/api/characters/{id}/portable/download` | 下载 `.memory.md` |
| GET | `/api/characters/{id}/portable/download?kind=json` | 下载 `.acm.json` 备份 |
| POST | `/api/portable/import` | 导入 ACM 备份到本站 |

---

## 数据与隐私

| 路径 | 说明 |
|------|------|
| `data/memory.db` | SQLite（角色 / 记忆） |

真正随身带走的是下载的 **`.memory.md`**（以及可选的 `.acm.json`）。

---

## 许可

按需自用或私有部署。
