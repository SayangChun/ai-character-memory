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

const state = {
  characters: [],
  currentId: null,
  memories: [],
  editMemoryId: null,
  suggestions: [],
  portablePackage: null,
  step: 1,
  exportPrompt: null,
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

// ── toast / ui ───────────────────────────────────────────

function toast(message, type = "info") {
  const wrap = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

function importanceLabel(n) {
  return `重要度 ${n}`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fillSelect(el, map, includeAll = false) {
  if (!el) return;
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

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    return true;
  }
}

// ── wizard ───────────────────────────────────────────────

function goStep(n) {
  state.step = n;
  document.querySelectorAll(".step-panel").forEach((p) => {
    p.classList.toggle("active", Number(p.dataset.step) === n);
  });
  document.querySelectorAll(".step-tab").forEach((tab) => {
    const s = Number(tab.dataset.step);
    tab.classList.toggle("active", s === n);
    tab.classList.toggle("done", s < n && !!state.currentId);
    if (state.currentId) tab.disabled = false;
    else tab.disabled = s > 1;
  });

  if (n === 2 && state.currentId) {
    loadMemories();
    refreshPersonaPreview();
    updateSessionBar();
  }
  if (n === 3 && state.currentId) {
    loadPortablePreview();
    updateSessionBar();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateSessionBar() {
  const bar = document.getElementById("sessionBar");
  const c = state.characters.find((x) => x.id === state.currentId);
  if (!c) {
    bar.style.display = "none";
    return;
  }
  bar.style.display = "flex";
  document.getElementById("sessionCharName").textContent = c.display_name;
  document.getElementById("sessionMemCount").textContent =
    `· ${c.memory_count ?? state.memories.length} 条记忆`;
}

function refreshPersonaPreview() {
  const c = state.characters.find((x) => x.id === state.currentId);
  if (!c) return;
  document.getElementById("personaPreview").textContent =
    c.persona || "（未设置人设）";
  document.getElementById("stylePreview").textContent =
    c.speaking_style || "（未设置说话风格）";
}

// ── export prompt (for previous AI) ──────────────────────

async function loadExportPrompt() {
  try {
    const data = await api("/api/export-prompt");
    state.exportPrompt = data;
    document.getElementById("exportPromptText").textContent = data.prompt;
    const tips = document.getElementById("exportPromptTips");
    tips.innerHTML = (data.tips || [])
      .map((t) => `<li>${escapeHtml(t)}</li>`)
      .join("");
    if (data.expected_format_hint) {
      document.getElementById("exportPromptHint").textContent =
        data.expected_format_hint;
    }
  } catch (e) {
    document.getElementById("exportPromptText").textContent =
      "加载提示词失败：" + (e.message || e);
  }
}

async function copyExportPrompt() {
  const text =
    state.exportPrompt?.prompt ||
    document.getElementById("exportPromptText").textContent;
  if (!text || text.startsWith("（加载") || text.startsWith("加载失败")) {
    toast("提示词尚未加载", "error");
    return;
  }
  await copyText(text);
  toast("提示词已复制 — 去旧 AI 对话里粘贴发送", "success");
}

// ── AI dump import ───────────────────────────────────────

function getDumpText() {
  return document.getElementById("aiDumpText").value.trim();
}

async function previewDump() {
  const text = getDumpText();
  if (!text) {
    toast("请先粘贴旧 AI 的导出正文", "error");
    return;
  }
  const box = document.getElementById("dumpPreviewBox");
  try {
    const data = await api("/api/import/ai-dump/preview", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    box.style.display = "block";
    const ch = data.character || {};
    const previewLines = (data.memories_preview || [])
      .slice(0, 12)
      .map(
        (m) =>
          `<li><span class="tag cat-${escapeHtml(m.category)}">${escapeHtml(
            CATEGORIES[m.category] || m.category
          )}</span> ${escapeHtml(m.content)}</li>`
      )
      .join("");
    box.innerHTML = `
      <div class="dump-preview-head">预览（尚未写入）</div>
      <p><strong>${escapeHtml(ch.display_name || "—")}</strong>
        · ${escapeHtml(ch.relationship_stage || "")}
        · 将导入约 <strong>${data.memory_count}</strong> 条记忆
        · 格式 ${escapeHtml(data.source_format || "")}</p>
      <p class="hint">人设摘要：${escapeHtml((ch.persona || "（空）").slice(0, 160))}${(ch.persona || "").length > 160 ? "…" : ""}</p>
      ${
        data.parse_notes?.length
          ? `<p class="hint">解析备注：${data.parse_notes.map(escapeHtml).join("；")}</p>`
          : ""
      }
      <ul class="dump-preview-list">${previewLines || "<li class='hint'>未识别到记忆条目</li>"}</ul>
      ${
        data.memory_count > 12
          ? `<p class="hint">… 另有 ${data.memory_count - 12} 条未在预览中展示</p>`
          : ""
      }
    `;
    if (data.memory_count === 0 && !ch.persona) {
      toast("几乎没解析出内容，请确认粘贴的是完整导出正文", "error");
    } else {
      toast(`预览：${ch.display_name} · ${data.memory_count} 条记忆`, "success");
    }
  } catch (e) {
    toast(e.message, "error");
  }
}

async function importDump() {
  const text = getDumpText();
  if (!text) {
    toast("请先粘贴旧 AI 的导出正文", "error");
    return;
  }
  const btn = document.getElementById("btnImportDump");
  btn.disabled = true;
  try {
    const result = await api("/api/import/ai-dump", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    toast(result.message || "导入成功", "success");
    state.currentId = result.character.id;
    await loadCharacters();
    await selectCharacter(result.character.id, 2);
    document.getElementById("aiDumpText").value = "";
    document.getElementById("dumpPreviewBox").style.display = "none";
  } catch (e) {
    toast(e.message, "error");
  } finally {
    btn.disabled = false;
  }
}

// ── characters ───────────────────────────────────────────

async function loadCharacters() {
  state.characters = await api("/api/characters");
  updateSessionBar();
}

async function selectCharacter(id, preferredStep) {
  state.currentId = id;
  await loadCharacters();
  const c = state.characters.find((x) => x.id === id);
  if (!c) return;

  document.querySelectorAll(".step-tab").forEach((tab) => {
    tab.disabled = false;
  });

  refreshPersonaPreview();
  const step = preferredStep ?? 2;
  goStep(step);
  if (step >= 2) await loadMemories();
  if (step === 3) await loadPortablePreview();
}

async function saveCharacterManual() {
  const body = {
    name: document.getElementById("charName").value.trim(),
    display_name: document.getElementById("charDisplayName").value.trim(),
    avatar_emoji: "",
    relationship_stage:
      document.getElementById("charStage").value.trim() || "初识",
    persona: document.getElementById("charPersona").value,
    speaking_style: document.getElementById("charStyle").value,
    notes: document.getElementById("charNotes").value,
  };
  if (!body.name || !body.display_name) {
    toast("手动创建请填写内部名和显示名", "error");
    return;
  }
  try {
    const c = await api("/api/characters", {
      method: "POST",
      body: JSON.stringify(body),
    });
    state.currentId = c.id;
    toast("已手动创建，请补充记忆后下载", "success");
    await loadCharacters();
    await selectCharacter(c.id, 2);
  } catch (e) {
    toast(e.message, "error");
  }
}

function openEditPersona() {
  const c = state.characters.find((x) => x.id === state.currentId);
  if (!c) return;
  document.getElementById("editDisplayName").value = c.display_name || "";
  document.getElementById("editStage").value = c.relationship_stage || "";
  document.getElementById("editPersona").value = c.persona || "";
  document.getElementById("editStyle").value = c.speaking_style || "";
  document.getElementById("editNotes").value = c.notes || "";
  openModal("charModal");
}

async function saveEditPersona() {
  if (!state.currentId) return;
  try {
    await api(`/api/characters/${state.currentId}`, {
      method: "PATCH",
      body: JSON.stringify({
        display_name: document.getElementById("editDisplayName").value.trim(),
        relationship_stage:
          document.getElementById("editStage").value.trim() || "初识",
        persona: document.getElementById("editPersona").value,
        speaking_style: document.getElementById("editStyle").value,
        notes: document.getElementById("editNotes").value,
      }),
    });
    toast("人设已更新", "success");
    closeModal("charModal");
    await loadCharacters();
    refreshPersonaPreview();
    updateSessionBar();
    if (state.step === 3) await loadPortablePreview();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function startFresh() {
  if (state.currentId) {
    const ok = confirm(
      "开始新的一次导入会离开当前数据。若尚未下载 .memory.md，请先到第 3 步下载。\n\n确定重新开始？"
    );
    if (!ok) return;
  }
  state.currentId = null;
  state.memories = [];
  state.portablePackage = null;
  document.querySelectorAll(".step-tab").forEach((tab) => {
    tab.disabled = Number(tab.dataset.step) > 1;
  });
  document.getElementById("sessionBar").style.display = "none";
  goStep(1);
}

async function deleteCharacter() {
  if (!state.currentId) return;
  if (
    !confirm(
      "清除本站本次数据？\n（已下载到本地的 .memory.md 不受影响。）"
    )
  )
    return;
  try {
    await api(`/api/characters/${state.currentId}`, { method: "DELETE" });
    toast("本站数据已清除", "success");
    state.currentId = null;
    state.memories = [];
    goStep(1);
    await loadCharacters();
  } catch (e) {
    toast(e.message, "error");
  }
}

// ── memories ─────────────────────────────────────────────

async function loadMemories() {
  if (!state.currentId) return;
  const q = document.getElementById("searchQ")?.value.trim() || "";
  const category = document.getElementById("filterCategory")?.value || "";
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  if (document.getElementById("filterPinned")?.checked)
    params.set("pinned_only", "true");
  if (document.getElementById("filterActive")?.checked)
    params.set("active_only", "true");
  state.memories = await api(
    `/api/characters/${state.currentId}/memories?${params}`
  );
  renderMemories();
  const countEl = document.getElementById("memListCount");
  if (countEl) countEl.textContent = `${state.memories.length} 条`;
  updateSessionBar();
}

function renderMemories() {
  const list = document.getElementById("memoryList");
  if (!list) return;
  if (!state.memories.length) {
    list.innerHTML = `<div class="hint">暂无记忆。可返回第 1 步重新粘贴导出，或在此手动添加。</div>`;
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
          ${m.is_pinned ? '<span class="tag">置顶</span>' : ""}
          <span class="tag cat-${m.category}">${CATEGORIES[m.category] || m.category}</span>
          <span class="stars">${importanceLabel(m.importance)}</span>
          ${tags}
        </div>
        <div class="memory-content">${escapeHtml(m.content)}</div>
        <div class="memory-foot">
          <span>${new Date(m.updated_at).toLocaleString()}</span>
          <div class="memory-actions">
            <button class="btn btn-sm" type="button" onclick="togglePin(${m.id}, ${!m.is_pinned})">${m.is_pinned ? "取消置顶" : "置顶"}</button>
            <button class="btn btn-sm" type="button" onclick="toggleActive(${m.id}, ${!m.is_active})">${m.is_active ? "停用" : "启用"}</button>
            <button class="btn btn-sm" type="button" onclick="openEditMemory(${m.id})">编辑</button>
            <button class="btn btn-sm btn-danger" type="button" onclick="deleteMemory(${m.id})">删除</button>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

function openAddMemory() {
  state.editMemoryId = null;
  document.getElementById("memModalTitle").textContent = "添加记忆";
  document.getElementById("memContent").value = "";
  document.getElementById("memCategory").value = "fact";
  document.getElementById("memImportance").value = "3";
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
    source_platform: "manual",
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
    await loadCharacters();
    await loadMemories();
    if (state.step === 3) await loadPortablePreview();
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
    if (state.step === 3) await loadPortablePreview();
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
    if (state.step === 3) await loadPortablePreview();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function deleteMemory(id) {
  if (!confirm("删除这条记忆？")) return;
  try {
    await api(`/api/memories/${id}`, { method: "DELETE" });
    toast("已删除", "success");
    await loadCharacters();
    await loadMemories();
    if (state.step === 3) await loadPortablePreview();
  } catch (e) {
    toast(e.message, "error");
  }
}

// ── portable ─────────────────────────────────────────────

async function loadPortablePreview() {
  if (!state.currentId) return;
  const meta = document.getElementById("portableMeta");
  const preview = document.getElementById("portablePreview");
  try {
    const data = await api(`/api/characters/${state.currentId}/portable`);
    state.portablePackage = data;
    if (meta) {
      meta.innerHTML = `
        <span class="stat-chip">格式 ${escapeHtml(data.format || "ai-memory-pack")}</span>
        <span class="stat-chip">记忆 ${data.memory_count ?? 0}</span>
        <span class="stat-chip">置顶 ${data.pinned_memory_count ?? 0}</span>
        <span class="stat-chip">${data.char_count ?? 0} 字符</span>
      `;
    }
    if (preview) preview.textContent = data.markdown || "（空）";
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

function filenameFromResponse(res, fallback) {
  const cd = res.headers.get("Content-Disposition") || "";
  const mStar = cd.match(/filename\*=UTF-8''([^;]+)/i);
  const mPlain = cd.match(/filename="?([^";]+)"?/i);
  if (mStar) return decodeURIComponent(mStar[1]);
  if (mPlain) return mPlain[1];
  return fallback;
}

async function downloadPortablePackage() {
  if (!state.currentId) {
    toast("请先完成导入", "error");
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
    const text = await res.text();
    const filename = filenameFromResponse(res, "character.memory.md");
    downloadBlob(
      filename,
      new Blob([text], { type: "text/markdown;charset=utf-8" })
    );
    toast("已下载。换平台时把该文件直接发给新 AI 即可。", "success");
    await loadPortablePreview();
    document.getElementById("restoreGuide")?.classList.add("highlight");
    setTimeout(
      () => document.getElementById("restoreGuide")?.classList.remove("highlight"),
      2400
    );
  } catch (e) {
    try {
      const data = await api(`/api/characters/${state.currentId}/portable`);
      const name = data.character_name || data.display_name || "character";
      downloadBlob(
        `${name}.memory.md`,
        new Blob([data.markdown || ""], { type: "text/markdown;charset=utf-8" })
      );
      toast("已下载 .memory.md", "success");
    } catch (e2) {
      toast(e2.message || e.message, "error");
    }
  }
}

async function downloadAcmBackup() {
  if (!state.currentId) return;
  try {
    const res = await fetch(
      `/api/characters/${state.currentId}/portable/download?kind=json`,
      { credentials: "same-origin" }
    );
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    const filename = filenameFromResponse(res, "character.acm.json");
    downloadBlob(
      filename,
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    );
    toast("已下载站内备份", "success");
  } catch (e) {
    toast(e.message, "error");
  }
}

async function copyPortableMarkdown() {
  if (!state.currentId) return;
  try {
    const data =
      state.portablePackage ||
      (await api(`/api/characters/${state.currentId}/portable`));
    const text = data.markdown || "";
    if (!text) throw new Error("记忆包为空");
    await copyText(text);
    toast("已复制全文，可粘贴给新 AI", "success");
  } catch (e) {
    toast(e.message, "error");
  }
}

async function showPortableSpec() {
  try {
    const spec = await api("/api/portable/spec");
    const prompt = state.exportPrompt || (await api("/api/export-prompt"));
    const body = document.getElementById("specBody");
    const ex = document.getElementById("specExample");
    body.innerHTML = `
      <p><strong>主路径</strong>：给旧 AI 提示词 → 粘贴全量回复 → 本站解析 → 下载 .memory.md → 发给新 AI。</p>
      <p>${escapeHtml(spec.description || "")}</p>
      <ol style="padding-left:1.2em;margin:10px 0">
        ${(prompt.tips || [])
          .map((s) => `<li>${escapeHtml(s)}</li>`)
          .join("")}
      </ol>
    `;
    ex.textContent = prompt.prompt?.slice(0, 1200) || spec.example_preview || "";
    openModal("specModal");
  } catch (e) {
    toast(e.message, "error");
  }
}

// ── secondary chat extract ───────────────────────────────

function openImportModal() {
  document.getElementById("importText").value = "";
  document.getElementById("suggestList").innerHTML = "";
  state.suggestions = [];
  openModal("importModal");
}

async function runImportSuggest() {
  const text = document.getElementById("importText").value.trim();
  if (!text) {
    toast("请粘贴对话文本", "error");
    return;
  }
  try {
    const data = await api(`/api/characters/${state.currentId}/import/suggest`, {
      method: "POST",
      body: JSON.stringify({ text, source_platform: "manual" }),
    });
    state.suggestions = data.suggestions;
    renderSuggestions();
    if (!data.suggestions.length) toast("未提取到可用建议", "error");
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
          <span class="stars">${importanceLabel(s.importance)}</span>
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
  const memories = selected.map((s) => ({
    content: s.content,
    category: s.category,
    importance: s.importance,
    tags: s.tags || [],
    source_platform: "manual",
  }));
  try {
    const created = await api(
      `/api/characters/${state.currentId}/memories/bulk`,
      {
        method: "POST",
        body: JSON.stringify({ memories, skip_duplicates: true }),
      }
    );
    toast(`已补充 ${created.length} 条`, "success");
    closeModal("importModal");
    await loadCharacters();
    await loadMemories();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function importBundleFile(file) {
  const modeEl = document.getElementById("importMode");
  const mode = (modeEl && modeEl.value) || "create";
  try {
    const text = await file.text();
    const bundle = JSON.parse(text);
    const result = await api(
      `/api/portable/import?mode=${encodeURIComponent(mode)}`,
      { method: "POST", body: JSON.stringify(bundle) }
    );
    toast(result.message || "已载入备份", "success");
    state.currentId = result.character.id;
    await loadCharacters();
    await selectCharacter(result.character.id, 2);
  } catch (e) {
    toast(e.message || "导入失败", "error");
  }
}

async function seedDemo() {
  try {
    const r = await api("/api/demo/seed", { method: "POST" });
    toast(r.message + " — 可直接体验下载", "success");
    state.currentId = r.character_id;
    await loadCharacters();
    await selectCharacter(r.character_id, 3);
  } catch (e) {
    toast(e.message, "error");
  }
}

// ── init ─────────────────────────────────────────────────

function initSelects() {
  fillSelect(document.getElementById("filterCategory"), CATEGORIES, true);
  fillSelect(document.getElementById("memCategory"), CATEGORIES);
  document.getElementById("memImportance").innerHTML = [1, 2, 3, 4, 5]
    .map((n) => `<option value="${n}">${importanceLabel(n)}</option>`)
    .join("");
}

function bindAppEvents() {
  document.getElementById("btnCopyExportPrompt").onclick = copyExportPrompt;
  document.getElementById("btnPreviewDump").onclick = previewDump;
  document.getElementById("btnImportDump").onclick = importDump;
  document.getElementById("btnSaveChar").onclick = saveCharacterManual;
  document.getElementById("btnEditChar").onclick = openEditPersona;
  document.getElementById("btnSaveEditChar").onclick = saveEditPersona;
  document.getElementById("btnDeleteChar").onclick = deleteCharacter;
  document.getElementById("btnNewChar").onclick = startFresh;
  document.getElementById("btnAddMem").onclick = openAddMemory;
  document.getElementById("btnSaveMem").onclick = saveMemory;
  document.getElementById("btnImport").onclick = openImportModal;
  document.getElementById("btnSuggest").onclick = runImportSuggest;
  document.getElementById("btnConfirmImport").onclick = confirmImport;
  document.getElementById("btnDownloadPortableMain").onclick =
    downloadPortablePackage;
  document.getElementById("btnCopyPortableMd").onclick = copyPortableMarkdown;
  document.getElementById("btnDownloadAcmBackup").onclick = downloadAcmBackup;
  document.getElementById("btnShowSpec").onclick = showPortableSpec;
  document.getElementById("btnDemo").onclick = seedDemo;
  document.getElementById("btnGoStep3").onclick = () => goStep(3);
  document.getElementById("btnBackStep2").onclick = () => goStep(2);

  document.querySelectorAll(".step-tab").forEach((tab) => {
    tab.onclick = () => {
      if (tab.disabled) return;
      const s = Number(tab.dataset.step);
      if (s > 1 && !state.currentId) {
        toast("请先完成第 1 步：粘贴旧 AI 导出并导入", "error");
        return;
      }
      goStep(s);
    };
  });

  document.getElementById("searchQ").oninput = debounce(loadMemories, 250);
  document.getElementById("filterCategory").onchange = loadMemories;
  document.getElementById("filterPinned").onchange = loadMemories;
  document.getElementById("filterActive").onchange = loadMemories;

  for (const id of ["fileImport", "fileImportMain"]) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.onchange = (e) => {
      const f = e.target.files?.[0];
      if (f) importBundleFile(f);
      e.target.value = "";
    };
  }

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.onclick = () => closeModal(btn.dataset.close);
  });
}

window.togglePin = togglePin;
window.toggleActive = toggleActive;
window.openEditMemory = openEditMemory;
window.deleteMemory = deleteMemory;

async function enterApp() {
  bindAppEvents();
  initSelects();
  await loadExportPrompt();
  try {
    await loadCharacters();
    if (state.characters.length >= 1) {
      await selectCharacter(state.characters[0].id, 2);
      if (state.characters.length > 1) {
        toast("已载入本机上次导入的数据，可继续核对或下载", "info");
      }
    } else {
      goStep(1);
    }
  } catch (e) {
    console.error(e);
    toast(e.message || "初始化失败", "error");
    goStep(1);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  enterApp();
});
