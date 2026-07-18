# AI 角色记忆站

把 **AI 角色人设与记忆** 整理成 **规范化本地文件**（`.acm.json`）。  
换平台时 **上传本地文件即可恢复**，不必再访问本站取数。

---

## 产品逻辑（本地文件优先）

```
  整理角色记忆（本站或其它工具）
           │
           ▼
  下载标准包  xxx.acm.json   ← 你随身带走的「记忆源」
           │
           ▼
  新平台 / 新账号 / 新工具
           │
           ▼
  上传该文件 → 恢复人设 + 记忆库
```

| 以前（依赖站点） | 现在（本地可移植） |
|------------------|-------------------|
| 换平台先打开本站复制上下文 | 换平台直接上传本地 `.acm.json` |
| 记忆「住在」网站账号里 | 记忆「住在」你下载的文件里 |
| 各站粘贴格式不一 | 统一 `ai-character-memory` v1.0 |

网页粘贴上下文仍可作为 **辅助** 功能保留。

---

## 快速开始

### Windows

```bat
run.bat
```

浏览器打开：http://127.0.0.1:8765  

1. 注册 / 登录  
2. 创建角色或「加载演示角色」  
3. **下载到本地** → 得到 `角色名-日期.acm.json`  
4. 换环境时用侧边栏 **上传本地记忆包** 恢复  

### 手动部署

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt
python run.py --no-browser
```

默认监听 `0.0.0.0:8765`。

### 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `MEMORY_HOST` | `0.0.0.0` | 绑定地址 |
| `MEMORY_PORT` | `8765` | 端口 |
| `MEMORY_SECRET_KEY` | 自动生成 | 会话签名密钥（生产务必固定） |
| `MEMORY_ALLOW_REGISTER` | `1` | 设为 `0` 关闭公开注册 |
| `MEMORY_SESSION_MAX_AGE` | 14 天 | 登录 Cookie 有效期（秒） |
| `MEMORY_CORS_ORIGINS` | 空 | 跨域来源，逗号分隔 |
| `MEMORY_SITE_NAME` | AI 角色记忆站 | 站点名 |
| `MEMORY_SITE_TAGLINE` | … | 首页副标题 |
| `MEMORY_OPEN_BROWSER` | `0` | 为 `1` 时启动自动开浏览器 |

---

## 可移植格式 ACM v1.0

- **Format:** `ai-character-memory`  
- **扩展名:** `.acm.json`  
- **规范文档:** [docs/portable-format.md](docs/portable-format.md)  
- **在线说明:** `GET /api/portable/spec`

根结构要点：

```json
{
  "format": "ai-character-memory",
  "format_version": "1.0",
  "character": { "name": "linxia", "display_name": "林夏", "persona": "…" },
  "memories": [ { "content": "…", "category": "fact", "importance": 5 } ],
  "sessions": [],
  "meta": { "memory_count": 1, "checksum_sha256": "…" }
}
```

- 角色稳定键：`character.name`  
- 记忆去重：`content_hash`（对正文规范化后的 SHA-256）  
- **不含** 数据库自增 id，便于任意系统导入  

### 导入模式

| 模式 | 说明 |
|------|------|
| `create` | 新建角色（同名自动加后缀） |
| `merge` | 合并到同名角色，重复记忆跳过 |
| `replace` | 用文件覆盖同名角色的记忆 |

---

## 功能一览

- **可移植包**：下载 / 上传 / 预览 / 格式说明  
- **角色**：人设、说话风格、关系阶段  
- **记忆**：分类、置顶、重要度、来源、标签  
- **对话提取**：粘贴对话 → 规则建议 → 入库（辅助）  
- **上下文编译**：按平台格式生成提示词（辅助）  
- **账号**：注册 / 登录 / 退出，数据按用户隔离  

---

## API 摘要

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/site` | 否 | 站点配置 |
| GET | `/api/portable/spec` | 否 | ACM 格式说明 |
| GET | `/api/platforms` | 否 | 网页平台粘贴指南（辅助） |
| POST | `/api/auth/register` | 否 | 注册并登录 |
| POST | `/api/auth/login` | 否 | 登录 |
| * | `/api/characters…` | 需登录 | 角色与记忆 |
| GET | `/api/characters/{id}/portable` | 需登录 | 可移植包 JSON |
| GET | `/api/characters/{id}/portable/download` | 需登录 | 下载 `.acm.json` |
| POST | `/api/portable/import` | 需登录 | 上传 JSON 恢复 |
| POST | `/api/portable/import/file` | 需登录 | multipart 文件恢复 |

完整文档：`/docs`

---

## 数据与隐私

| 路径 | 说明 |
|------|------|
| `data/memory.db` | SQLite（用户 / 角色 / 记忆） |
| `data/.secret_key` | 会话密钥（勿提交到 Git） |

- 站内数据按 `user_id` 隔离  
- **跨平台恢复依赖你下载的本地文件**，请自行备份  

> 公网部署请配置 HTTPS、强 `MEMORY_SECRET_KEY`，并视情况关闭注册。

---

## 项目结构

```
memory/
├── app/
│   ├── main.py                 # FastAPI
│   ├── auth.py / config.py
│   ├── models.py / schemas.py / db.py
│   ├── services/
│   │   ├── portable.py         # ACM 可移植包
│   │   ├── context.py          # 上下文组装（辅助）
│   │   ├── importer.py         # 对话提取（辅助）
│   │   └── platforms.py
│   └── static/                 # Web UI
├── docs/
│   └── portable-format.md      # 格式规范
├── data/
├── requirements.txt
├── run.py
└── run.bat
```

---

## 许可

按需自用或私有部署。
