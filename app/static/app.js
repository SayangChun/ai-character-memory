const CATEGORIES = {
  fact: "基本事实",
  preference: "偏好喜好",
  event: "重要事件",
  emotion: "情感状态",
  relationship: "关系进展",
  habit: "习惯模式",
  taboo: "禁忌雷区",
  nickname: "称呼昵称",
  dialogue: "对话摘要",
  other: "其他",
};

const PLATFORMS = {
  manual: "手动录入",
  chatgpt: "ChatGPT 网页",
  claude: "Claude 网页",
  gemini: "Gemini 网页",
  character_ai: "Character.AI",
  grok: "Grok 网页",
  deepseek: "DeepSeek 网页",
  other: "其他网页 AI",
};

const FORMATS = {
  universal: "通用记忆卡",
  system_prompt: "系统提示词",
  chatgpt: "ChatGPT 格式",
  claude: "Claude 格式",
  gemini: "Gemini 格式",
  compact: "紧凑精简",
  json: "JSON",
};

const state = {
  site: null,
  platforms: [],
  selectedPlatformId: "chatgpt",
  characters: [],
  currentId: null,
  memories: [],
  stats: null,
  editMemoryId: null,
  suggestions: [],
  portablePackage: null,
};

// ── api ──────────────────────────────────────────────────

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      msg = data.detail || JSON.stringify(data);
    } catch (_) {}
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

// ── toast / ui helpers ───────────────────────────────────

function toast(message, type = "info") {
  const wrap = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function stars(n) {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fillSelect(el, map, includeAll = false) {
  el.innerHTML = "";
  if (includeAll) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "全部";
    el.appendChild(o);
  }
  for (const [k, v] of Object.entries(map)) {
    const o = document.createElement("option");
    o.value = k;
    o.textContent = v;
    el.appendChild(o);
  }
}



function openModal(id) {
  document.getElementById(id).classList.add("open");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function enterApp() {
  bindAppEvents();
  initSelects();
  try {
    await loadPlatforms();
    renderPlatformTabs();
  } catch (e) {
    console.error("loadPlatforms failed", e);
    state.platforms = [
      {
        id: "chatgpt",
        name: "ChatGPT",
        default_format: "chatgpt",
        paste_target: "对话开头",
        url: null,
      },
    ];
    renderPlatformTabs();
    toast("平台列表加载失败，已使用默认配置", "error");
  }
  try {
    await loadStats();
  } catch (e) {
    console.error("loadStats failed", e);
  }
  try {
    await loadCharacters();
    if (state.characters.length) {
      await selectCharacter(state.characters[0].id);
    } else {
      document.getElementById("emptyMain").style.display = "block";
      document.getElementById("mainContent").style.display = "none";
    }
  } catch (e) {
    console.error("loadCharacters failed", e);
    document.getElementById("charList").innerHTML =
      `<div class="hint" style="padding:12px;color:#e66">角色加载失败：${escapeHtml(
        e.message || String(e)
      )}</div>`;
    document.getElementById("emptyMain").style.display = "block";
    document.getElementById("mainContent").style.display = "none";
    toast(e.message || "角色加载失败", "error");
  }
}

// ── platforms workflow ───────────────────────────────────

async function loadPlatforms() {
  state.platforms = await api("/api/platforms");
  const logos = document.getElementById("platformLogos");
  if (logos) {
    logos.innerHTML = state.platforms
      .filter((p) => p.id !== "other")
      .map((p) => `<span class="plat-pill">${escapeHtml(p.name)}</span>`)
      .join("");
  }
}

function renderPlatformTabs() {
  const tabs = document.getElementById("platformTabs");
  if (!tabs) return;
  tabs.innerHTML = state.platforms
    .map(
      (p) => `
    <button class="plat-tab ${p.id === state.selectedPlatformId ? "active" : ""}"
      data-id="${p.id}">${escapeHtml(p.name)}</button>`
    )
    .join("");
  tabs.querySelectorAll(".plat-tab").forEach((btn) => {
    btn.onclick = async () => {
      state.selectedPlatformId = btn.dataset.id;
      renderPlatformTabs();
      renderWorkflow();
      const p = state.platforms.find((x) => x.id === state.selectedPlatformId);
      if (p && document.getElementById("ctxFormat")) {
        document.getElementById("ctxFormat").value = p.default_format;
        if (state.currentId) await generateContext();
      }
    };
  });
  renderWorkflow();
}

function renderWorkflow() {
  const p =
    state.platforms.find((x) => x.id === state.selectedPlatformId) ||
    state.platforms[0];
  const body = document.getElementById("workflowBody");
  if (!body) return;
  if (!p) {
    body.innerHTML = "";
    return;
  }
  body.innerHTML = `
    <div class="workflow-meta">
      <div>
        <strong>可选粘贴位置：</strong>${escapeHtml(p.paste_target || "对话开头")}
      </div>
      ${
        p.url
          ? `<a class="btn btn-sm" href="${escapeHtml(p.url)}" target="_blank" rel="noopener">打开 ${escapeHtml(p.name)} ↗</a>`
          : ""
      }
    </div>
    <p class="hint tip-line">💡 主路径请使用上方「下载 .acm.json」；此处仅辅助网页粘贴。</p>
    <div class="workflow-actions">
      <button class="btn btn-sm btn-primary" id="btnWorkflowCopy">复制该平台格式上下文</button>
      <button class="btn btn-sm" id="btnWorkflowImport">从对话提取记忆</button>
    </div>
  `;
  const copyBtn = document.getElementById("btnWorkflowCopy");
  if (copyBtn) {
    copyBtn.onclick = async () => {
      if (!state.currentId) {
        toast("请先选择角色", "error");
        return;
      }
      document.getElementById("ctxFormat").value = p.default_format;
      await generateContext();
      await copyContext();
    };
  }
  const importBtn = document.getElementById("btnWorkflowImport");
  if (importBtn) {
    importBtn.onclick = () => openImportModal(p.id);
  }
}

// ── data load ────────────────────────────────────────────

async function loadStats() {
  state.stats = await api("/api/stats");
  document.getElementById("stats").innerHTML = `
    <span class="stat-chip">角色 ${state.stats.character_count}</span>
    <span class="stat-chip">记忆 ${state.stats.memory_count}</span>
    <span class="stat-chip">置顶 ${state.stats.pinned_memory_count}</span>
  `;
}

async function loadCharacters() {
  state.characters = await api("/api/characters");
  const list = document.getElementById("charList");
  list.innerHTML = "";
  if (!state.characters.length) {
    list.innerHTML = `<div class="hint" style="padding:12px">还没有角色，点上方按钮创建或加载演示。</div>`;
    return;
  }
  for (const c of state.characters) {
    const btn = document.createElement("button");
    btn.className = `char-item ${c.id === state.currentId ? "active" : ""}`;
    btn.innerHTML = `
      <div class="char-emoji">${escapeHtml(c.avatar_emoji || "💖")}</div>
      <div class="char-meta">
        <div class="name">${escapeHtml(c.display_name)}</div>
        <div class="sub">${escapeHtml(c.relationship_stage)} · ${c.memory_count} 条记忆</div>
      </div>`;
    btn.onclick = () => selectCharacter(c.id);
    list.appendChild(btn);
  }
}

async function selectCharacter(id) {
  state.currentId = id;
  await loadCharacters();
  const c = state.characters.find((x) => x.id === id);
  document.getElementById("emptyMain").style.display = "none";
  document.getElementById("mainContent").style.display = "block";
  document.getElementById("charTitle").innerHTML = `
    <span>${escapeHtml(c.avatar_emoji || "💖")}</span>
    <span>${escapeHtml(c.display_name)}</span>
    <span class="badge pink">${escapeHtml(c.relationship_stage)}</span>
  `;
  document.getElementById("charSub").textContent =
    `内部名: ${c.name} · 记忆 ${c.memory_count} · 可下载本地包换平台恢复`;
  document.getElementById("personaPreview").textContent =
    c.persona || "（未设置人设）";
  document.getElementById("stylePreview").textContent =
    c.speaking_style || "（未设置说话风格）";
  await loadMemories();
  await loadPortablePreview();
  await generateContext();
  renderWorkflow();
}

async function loadMemories() {
  if (!state.currentId) return;
  const q = document.getElementById("searchQ").value.trim();
  const category = document.getElementById("filterCategory").value;
  const platform = document.getElementById("filterPlatform").value;
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  if (platform) params.set("platform", platform);
  if (document.getElementById("filterPinned").checked)
    params.set("pinned_only", "true");
  if (document.getElementById("filterActive").checked)
    params.set("active_only", "true");
  state.memories = await api(
    `/api/characters/${state.currentId}/memories?${params}`
  );
  renderMemories();
}

function renderMemories() {
  const list = document.getElementById("memoryList");
  if (!state.memories.length) {
    list.innerHTML = `<div class="hint">暂无记忆。添加第一条，或从网页对话导入。</div>`;
    return;
  }
  list.innerHTML = state.memories
    .map((m) => {
      const tags = (m.tags || [])
        .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
        .join("");
      return `
      <div class="memory-card ${m.is_pinned ? "pinned" : ""} ${m.is_active ? "" : "inactive"}">
        <div class="memory-head">
          ${m.is_pinned ? '<span class="tag">📌 置顶</span>' : ""}
          <span class="tag cat-${m.category}">${CATEGORIES[m.category] || m.category}</span>
          <span class="tag">${PLATFORMS[m.source_platform] || m.source_platform}</span>
          <span class="stars">${stars(m.importance)}</span>
          ${tags}
        </div>
        <div class="memory-content">${escapeHtml(m.content)}</div>
        <div class="memory-foot">
          <span>${new Date(m.updated_at).toLocaleString()}</span>
          <div class="memory-actions">
            <button class="btn btn-sm" onclick="togglePin(${m.id}, ${!m.is_pinned})">${m.is_pinned ? "取消置顶" : "置顶"}</button>
            <button class="btn btn-sm" onclick="toggleActive(${m.id}, ${!m.is_active})">${m.is_active ? "停用" : "启用"}</button>
            <button class="btn btn-sm" onclick="openEditMemory(${m.id})">编辑</button>
            <button class="btn btn-sm btn-danger" onclick="deleteMemory(${m.id})">删除</button>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

// ── character CRUD ───────────────────────────────────────

function openCharModal(edit = false) {
  const c = edit ? state.characters.find((x) => x.id === state.currentId) : null;
  document.getElementById("charModalTitle").textContent = edit
    ? "编辑角色"
    : "新建角色";
  document.getElementById("charName").value = c ? c.name : "";
  document.getElementById("charName").disabled = !!edit;
  document.getElementById("charDisplayName").value = c ? c.display_name : "";
  document.getElementById("charEmoji").value = c ? c.avatar_emoji : "💖";
  document.getElementById("charStage").value = c ? c.relationship_stage : "初识";
  document.getElementById("charPersona").value = c ? c.persona : "";
  document.getElementById("charStyle").value = c ? c.speaking_style : "";
  document.getElementById("charNotes").value = c ? c.notes : "";
  document.getElementById("charModal").dataset.mode = edit ? "edit" : "create";
  openModal("charModal");
}

async function saveCharacter() {
  const mode = document.getElementById("charModal").dataset.mode;
  const body = {
    name: document.getElementById("charName").value.trim(),
    display_name: document.getElementById("charDisplayName").value.trim(),
    avatar_emoji: document.getElementById("charEmoji").value.trim() || "💖",
    relationship_stage:
      document.getElementById("charStage").value.trim() || "初识",
    persona: document.getElementById("charPersona").value,
    speaking_style: document.getElementById("charStyle").value,
    notes: document.getElementById("charNotes").value,
  };
  if (!body.name || !body.display_name) {
    toast("请填写内部名和显示名", "error");
    return;
  }
  try {
    if (mode === "edit") {
      await api(`/api/characters/${state.currentId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast("角色已更新", "success");
    } else {
      const c = await api("/api/characters", {
        method: "POST",
        body: JSON.stringify(body),
      });
      state.currentId = c.id;
      toast("角色已创建", "success");
    }
    closeModal("charModal");
    await loadStats();
    await loadCharacters();
    await selectCharacter(state.currentId);
  } catch (e) {
    toast(e.message, "error");
  }
}

async function deleteCharacter() {
  if (!state.currentId) return;
  if (!confirm("确定删除该角色及其全部记忆？此操作不可恢复。")) return;
  try {
    await api(`/api/characters/${state.currentId}`, { method: "DELETE" });
    state.currentId = null;
    toast("角色已删除", "success");
    document.getElementById("emptyMain").style.display = "block";
    document.getElementById("mainContent").style.display = "none";
    await loadStats();
    await loadCharacters();
  } catch (e) {
    toast(e.message, "error");
  }
}

// ── memory CRUD ──────────────────────────────────────────

function openAddMemory() {
  state.editMemoryId = null;
  document.getElementById("memModalTitle").textContent = "添加记忆";
  document.getElementById("memContent").value = "";
  document.getElementById("memCategory").value = "fact";
  document.getElementById("memImportance").value = "3";
  document.getElementById("memPlatform").value = "manual";
  document.getElementById("memTags").value = "";
  document.getElementById("memPinned").checked = false;
  openModal("memModal");
}

function openEditMemory(id) {
  const m = state.memories.find((x) => x.id === id);
  if (!m) return;
  state.editMemoryId = id;
  document.getElementById("memModalTitle").textContent = "编辑记忆";
  document.getElementById("memContent").value = m.content;
  document.getElementById("memCategory").value = m.category;
  document.getElementById("memImportance").value = String(m.importance);
  document.getElementById("memPlatform").value = m.source_platform;
  document.getElementById("memTags").value = (m.tags || []).join(", ");
  document.getElementById("memPinned").checked = m.is_pinned;
  openModal("memModal");
}

async function saveMemory() {
  const content = document.getElementById("memContent").value.trim();
  if (!content) {
    toast("请填写记忆内容", "error");
    return;
  }
  const tags = document
    .getElementById("memTags")
    .value.split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);
  const body = {
    content,
    category: document.getElementById("memCategory").value,
    importance: Number(document.getElementById("memImportance").value),
    source_platform: document.getElementById("memPlatform").value,
    tags,
    is_pinned: document.getElementById("memPinned").checked,
  };
  try {
    if (state.editMemoryId) {
      await api(`/api/memories/${state.editMemoryId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast("记忆已更新", "success");
    } else {
      await api(`/api/characters/${state.currentId}/memories`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast("记忆已添加", "success");
    }
    closeModal("memModal");
    await loadStats();
    await loadCharacters();
    await loadMemories();
    await loadPortablePreview();
    await generateContext();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function togglePin(id, pinned) {
  try {
    await api(`/api/memories/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_pinned: pinned }),
    });
    await loadMemories();
    await loadPortablePreview();
    await generateContext();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function toggleActive(id, active) {
  try {
    await api(`/api/memories/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: active }),
    });
    await loadMemories();
    await loadPortablePreview();
    await generateContext();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function deleteMemory(id) {
  if (!confirm("删除这条记忆？")) return;
  try {
    await api(`/api/memories/${id}`, { method: "DELETE" });
    toast("已删除", "success");
    await loadStats();
    await loadCharacters();
    await loadMemories();
    await loadPortablePreview();
    await generateContext();
  } catch (e) {
    toast(e.message, "error");
  }
}

// ── context ──────────────────────────────────────────────

async function generateContext() {
  if (!state.currentId) return;
  const body = {
    format: document.getElementById("ctxFormat").value,
    max_chars: Number(document.getElementById("ctxMaxChars").value) || 6000,
    include_persona: document.getElementById("ctxPersona").checked,
    min_importance: Number(document.getElementById("ctxMinImp").value) || 1,
    pinned_first: true,
  };
  try {
    const data = await api(`/api/characters/${state.currentId}/context`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    document.getElementById("contextPreview").textContent = data.content;
    document.getElementById("contextMeta").innerHTML = `
      <span>${data.memory_count} 条记忆</span>
      <span>${data.char_count} 字符</span>
      <span>~${data.estimated_tokens} tokens</span>
      <span>${data.truncated ? "⚠️ 已截断" : "✓ 完整"}</span>
    `;
  } catch (e) {
    toast(e.message, "error");
  }
}

async function copyContext() {
  const text = document.getElementById("contextPreview").textContent;
  try {
    await navigator.clipboard.writeText(text);
    toast("已复制上下文（辅助粘贴）；换平台请优先下载本地包", "success");
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("已复制到剪贴板", "success");
  }
}

// ── portable package（主路径）────────────────────────────

async function loadPortablePreview() {
  if (!state.currentId) return;
  const meta = document.getElementById("portableMeta");
  const preview = document.getElementById("portablePreview");
  try {
    const data = await api(`/api/characters/${state.currentId}/portable`);
    state.portablePackage = data;
    const m = data.meta || {};
    if (meta) {
      meta.innerHTML = `
        <span class="stat-chip">格式 ${escapeHtml(data.format || "ai-character-memory")}</span>
        <span class="stat-chip">v${escapeHtml(String(data.format_version || "1.0"))}</span>
        <span class="stat-chip">记忆 ${m.memory_count ?? (data.memories || []).length}</span>
        <span class="stat-chip">置顶 ${m.pinned_memory_count ?? 0}</span>
        <span class="stat-chip">会话 ${m.session_count ?? 0}</span>
      `;
    }
    if (preview) {
      preview.textContent = JSON.stringify(data, null, 2);
    }
  } catch (e) {
    if (preview) preview.textContent = `加载失败：${e.message}`;
  }
}

function downloadBlob(filename, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function downloadPortablePackage() {
  if (!state.currentId) {
    toast("请先选择角色", "error");
    return;
  }
  try {
    const res = await fetch(
      `/api/characters/${state.currentId}/portable/download`,
      { credentials: "same-origin" }
    );
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const data = await res.json();
        msg = data.detail || msg;
      } catch (_) {}
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    const blob = await res.blob();
    let filename = `character.acm.json`;
    const cd = res.headers.get("Content-Disposition") || "";
    const mStar = cd.match(/filename\*=UTF-8''([^;]+)/i);
    const mPlain = cd.match(/filename="?([^";]+)"?/i);
    if (mStar) {
      filename = decodeURIComponent(mStar[1]);
    } else if (mPlain) {
      filename = mPlain[1];
    }
    downloadBlob(filename, blob);
    toast("已下载到本地。换平台时上传此文件即可恢复记忆", "success");
    await loadPortablePreview();
  } catch (e) {
    // 回退：用 JSON API 生成文件
    try {
      const data = await api(`/api/characters/${state.currentId}/portable`);
      const name = (data.character && data.character.name) || "character";
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      downloadBlob(`${name}.acm.json`, blob);
      toast("已下载到本地（.acm.json）", "success");
    } catch (e2) {
      toast(e2.message || e.message, "error");
    }
  }
}

async function copyPortableJson() {
  if (!state.currentId) return;
  try {
    const data =
      state.portablePackage ||
      (await api(`/api/characters/${state.currentId}/portable`));
    const text = JSON.stringify(data, null, 2);
    await navigator.clipboard.writeText(text);
    toast("可移植包 JSON 已复制", "success");
  } catch (e) {
    toast(e.message, "error");
  }
}

async function showPortableSpec() {
  try {
    const spec = await api("/api/portable/spec");
    const body = document.getElementById("specBody");
    const ex = document.getElementById("specExample");
    body.innerHTML = `
      <p><strong>${escapeHtml(spec.format)}</strong> v${escapeHtml(spec.format_version)}</p>
      <p>${escapeHtml(spec.description || "")}</p>
      <ol style="padding-left:1.2em;margin:10px 0">
        ${(spec.workflow || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}
      </ol>
      <p class="hint">文件扩展名：<code>${escapeHtml(spec.file_extension || ".acm.json")}</code>
      · 角色主键：<code>character.name</code>
      · 记忆去重：<code>content_hash</code></p>
    `;
    ex.textContent = JSON.stringify(spec.example_minimal || spec, null, 2);
    openModal("specModal");
  } catch (e) {
    toast(e.message, "error");
  }
}

// ── import / export ──────────────────────────────────────

function openImportModal(platformId) {
  document.getElementById("importText").value = "";
  document.getElementById("importPlatform").value =
    platformId || state.selectedPlatformId || "other";
  document.getElementById("suggestList").innerHTML = "";
  state.suggestions = [];
  openModal("importModal");
}

async function runImportSuggest() {
  const text = document.getElementById("importText").value.trim();
  if (!text) {
    toast("请粘贴网页对话文本", "error");
    return;
  }
  try {
    const data = await api(`/api/characters/${state.currentId}/import/suggest`, {
      method: "POST",
      body: JSON.stringify({
        text,
        source_platform: document.getElementById("importPlatform").value,
      }),
    });
    state.suggestions = data.suggestions;
    renderSuggestions();
    if (!data.suggestions.length) toast("未提取到可用记忆建议", "error");
  } catch (e) {
    toast(e.message, "error");
  }
}

function renderSuggestions() {
  const list = document.getElementById("suggestList");
  if (!state.suggestions.length) {
    list.innerHTML = `<div class="hint">暂无建议</div>`;
    return;
  }
  list.innerHTML = state.suggestions
    .map(
      (s, i) => `
    <div class="suggest-item">
      <input type="checkbox" data-idx="${i}" checked />
      <div>
        <div class="content">${escapeHtml(s.content)}</div>
        <div style="margin-top:4px">
          <span class="tag cat-${s.category}">${CATEGORIES[s.category] || s.category}</span>
          <span class="stars">${stars(s.importance)}</span>
        </div>
      </div>
      <span class="hint">#${i + 1}</span>
    </div>`
    )
    .join("");
}

async function confirmImport() {
  const checks = [
    ...document.querySelectorAll("#suggestList input[type=checkbox]"),
  ];
  const selected = checks
    .filter((c) => c.checked)
    .map((c) => state.suggestions[Number(c.dataset.idx)]);
  if (!selected.length) {
    toast("请至少选择一条", "error");
    return;
  }
  const platform = document.getElementById("importPlatform").value;
  const memories = selected.map((s) => ({
    content: s.content,
    category: s.category,
    importance: s.importance,
    tags: s.tags || [],
    source_platform: platform,
  }));
  try {
    const created = await api(
      `/api/characters/${state.currentId}/memories/bulk`,
      {
        method: "POST",
        body: JSON.stringify({ memories, skip_duplicates: true }),
      }
    );
    const raw = document.getElementById("importText").value.slice(0, 2000);
    await api(`/api/characters/${state.currentId}/sessions`, {
      method: "POST",
      body: JSON.stringify({
        platform,
        title: `网页导入 ${created.length} 条`,
        summary: `从网页对话导入 ${created.length} 条`,
        raw_excerpt: raw,
      }),
    });
    toast(`成功导入 ${created.length} 条记忆（记得下载本地包）`, "success");
    closeModal("importModal");
    await loadStats();
    await loadCharacters();
    await loadMemories();
    await loadPortablePreview();
    await generateContext();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function importBundleFile(file) {
  const modeEl = document.getElementById("importMode");
  const mode = (modeEl && modeEl.value) || "create";
  try {
    const text = await file.text();
    let bundle;
    try {
      bundle = JSON.parse(text);
    } catch (_) {
      throw new Error("文件不是合法 JSON");
    }
    const result = await api(
      `/api/portable/import?mode=${encodeURIComponent(mode)}`,
      {
        method: "POST",
        body: JSON.stringify(bundle),
      }
    );
    toast(result.message || `已恢复「${result.character.display_name}」`, "success");
    state.currentId = result.character.id;
    await loadStats();
    await loadCharacters();
    await selectCharacter(result.character.id);
  } catch (e) {
    toast(e.message || "导入失败", "error");
  }
}

async function seedDemo() {
  try {
    const r = await api("/api/demo/seed", { method: "POST" });
    toast(r.message, "success");
    state.currentId = r.character_id;
    await loadStats();
    await loadCharacters();
    await selectCharacter(r.character_id);
  } catch (e) {
    toast(e.message, "error");
  }
}

// ── init ─────────────────────────────────────────────────

function initSelects() {
  fillSelect(document.getElementById("filterCategory"), CATEGORIES, true);
  fillSelect(document.getElementById("filterPlatform"), PLATFORMS, true);
  fillSelect(document.getElementById("memCategory"), CATEGORIES);
  fillSelect(document.getElementById("memPlatform"), PLATFORMS);
  fillSelect(document.getElementById("importPlatform"), PLATFORMS);
  fillSelect(document.getElementById("ctxFormat"), FORMATS);
  document.getElementById("ctxFormat").value = "universal";
  document.getElementById("memImportance").innerHTML = [1, 2, 3, 4, 5]
    .map((n) => `<option value="${n}">${stars(n)} (${n})</option>`)
    .join("");
  document.getElementById("ctxMinImp").innerHTML = [1, 2, 3, 4, 5]
    .map((n) => `<option value="${n}">≥ ${n}</option>`)
    .join("");
}

function bindAppEvents() {
  document.getElementById("btnNewChar").onclick = () => openCharModal(false);
  document.getElementById("btnEditChar").onclick = () => openCharModal(true);
  document.getElementById("btnDeleteChar").onclick = deleteCharacter;
  document.getElementById("btnSaveChar").onclick = saveCharacter;
  document.getElementById("btnAddMem").onclick = openAddMemory;
  document.getElementById("btnSaveMem").onclick = saveMemory;
  document.getElementById("btnImport").onclick = () => openImportModal();
  document.getElementById("btnSuggest").onclick = runImportSuggest;
  document.getElementById("btnConfirmImport").onclick = confirmImport;
  document.getElementById("btnDownloadPortable").onclick = downloadPortablePackage;
  document.getElementById("btnDownloadPortableMain").onclick =
    downloadPortablePackage;
  document.getElementById("btnCopyPortableJson").onclick = copyPortableJson;
  document.getElementById("btnShowSpec").onclick = showPortableSpec;
  document.getElementById("btnCopyCtx").onclick = copyContext;
  document.getElementById("btnGenCtx").onclick = generateContext;
  document.getElementById("btnDemo").onclick = seedDemo;
    document.getElementById("btnRefresh").onclick = async () => {
    await loadStats();
    await loadCharacters();
    if (state.currentId) {
      await loadMemories();
      await loadPortablePreview();
      await generateContext();
    }
  };
  document.getElementById("searchQ").oninput = debounce(loadMemories, 250);
  document.getElementById("filterCategory").onchange = loadMemories;
  document.getElementById("filterPlatform").onchange = loadMemories;
  document.getElementById("filterPinned").onchange = loadMemories;
  document.getElementById("filterActive").onchange = loadMemories;
  document.getElementById("ctxFormat").onchange = generateContext;
  document.getElementById("ctxMaxChars").onchange = generateContext;
  document.getElementById("ctxMinImp").onchange = generateContext;
  document.getElementById("ctxPersona").onchange = generateContext;

  const bindFile = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.onchange = (e) => {
      const f = e.target.files?.[0];
      if (f) importBundleFile(f);
      e.target.value = "";
    };
  };
  bindFile("fileImport");
  bindFile("fileImportMain");

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.onclick = () => closeModal(btn.dataset.close);
  });
}

window.togglePin = togglePin;
window.toggleActive = toggleActive;
window.openEditMemory = openEditMemory;
window.deleteMemory = deleteMemory;

document.addEventListener("DOMContentLoaded", () => {
  enterApp();
});
