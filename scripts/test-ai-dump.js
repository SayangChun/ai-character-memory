const { parseAiFullDump, buildExportPromptForPreviousAi } = require('../dist/services/aiDump');

const sample = `# AI 记忆全量导出 · 林夏

## 角色身份
- **显示名**：林夏
- **内部名**：linxia
- **关系阶段**：热恋中

## 人设
温柔体贴的邻家女孩，喜欢撒娇。

## 说话风格
口语化、软糯，叫用户阿哲。

## 持久记忆

### 禁忌雷区
- 不要提前任 **[置顶]**

### 称呼昵称
- 用户的名字是阿哲 **[置顶]**

### 基本事实
- 用户在上海做程序员
- 用户喜欢不加糖的美式

### 偏好喜好
- 喜欢下雨天待在家里
`;

const p = parseAiFullDump(sample);
console.log(
  JSON.stringify(
    {
      display: p.character.display_name,
      name: p.character.name,
      persona: p.character.persona,
      style: p.character.speaking_style,
      stage: p.character.relationship_stage,
      n: p.memories.length,
      memories: p.memories,
      notes: p.parse_notes,
      fmt: p.source_format,
    },
    null,
    2
  )
);

const ep = buildExportPromptForPreviousAi();
console.log('prompt_len', ep.prompt.length);
if (p.memories.length < 4) {
  console.error('FAIL: expected at least 4 memories');
  process.exit(1);
}
if (p.character.display_name !== '林夏') {
  console.error('FAIL: display name');
  process.exit(1);
}
console.log('OK');
