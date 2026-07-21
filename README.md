# AI 记忆迁移（一次带走）

把**各网页端 AI 的记忆**一次性整理成**本地文件**。  
换用新 AI 时，**直接把该文件发给新 AI** 即可恢复记忆——**不经过本网站**。

> 本站是**一次性整理 / 导出工具**，不是需要反复登录维护的云端记忆库。  
> 真正随身带走的是下载到本地的 **`.memory.md`**。

---

## 怎么用（主路径：旧 AI 全量导出）

```
复制本站「导出提示词」
        │
        ▼
发给之前一直在用的 AI（原对话里粘贴）
        │
        ▼
旧 AI 按格式输出全量人设 + 记忆
        │
        ▼
把回复整段粘贴进本站 → 一键解析导入
        │
        ▼
（可选）核对 / 补几条细节
        │
        ▼
下载 xxx.memory.md → 换平台时直接发给新 AI
```

1. **从旧 AI 导入**：复制提示词 → 旧 AI 导出 → 粘贴解析（**不用从零手填**）  
2. **核对补充**（可选）  
3. **下载 `.memory.md`** → 以后换平台只用这个文件  

API：`GET /api/export-prompt`（提示词）、`POST /api/import/ai-dump`（粘贴导入）

---

## 两种本地文件

| 文件 | 用途 |
|------|------|
| **`.memory.md`**（主） | 发给任意新 AI，恢复人设与记忆 |
| **`.acm.json`**（辅） | 仅当你还要回本站继续改内容时导入 |

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

按向导走完三步，下载记忆包即可。

---

## 主格式：AI 记忆包 v2（`.memory.md`）

- **Format:** `ai-memory-pack`  
- **扩展名:** `.memory.md`  
- **在线说明:** `GET /api/portable/spec`

文件开头自带「给接收本文件的 AI」说明与优先级规则，可直接投喂。

---

## API 摘要

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/site` | 站点配置（`product_mode: one_shot_export`） |
| GET | `/api/portable/spec` | 记忆包格式说明 |
| * | `/api/characters…` | 整理过程中的角色与记忆 |
| GET | `/api/characters/{id}/portable/download` | 下载 `.memory.md` |
| GET | `/api/characters/{id}/portable/download?kind=json` | 下载 `.acm.json` 备份 |
| POST | `/api/portable/import` | 导入 ACM 备份到本站（可选） |

---

## 产品边界

| 你要做的事 | 该怎么做 |
|------------|----------|
| 换 ChatGPT / Claude / 新模型，要它「记得我」 | 把本地 **`.memory.md`** 直接发给该 AI |
| 还要改人设/记忆再导出 | 可再打开本站，或导入 `.acm.json` 后改完再下 |
| 在本站长期当云记忆用 | **不推荐**——本站不是为此设计的 |

---

## 数据与隐私

| 路径 | 说明 |
|------|------|
| `data/memory.db` | 整理过程用的本地 SQLite（可清） |

恢复记忆的权威来源是你下载的 **`.memory.md`**，不是网站数据库。

---

## 许可

按需自用或私有部署。
