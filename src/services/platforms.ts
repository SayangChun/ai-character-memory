export type PlatformDef = {
  id: string;
  name: string;
  default_format: string;
  paste_target: string;
  url: string | null;
};

/** Static list of supported AI web platforms for the workflow UI. */
export const PLATFORMS: PlatformDef[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    default_format: 'chatgpt',
    paste_target: '自定义指令 / 对话开头',
    url: 'https://chatgpt.com',
  },
  {
    id: 'claude',
    name: 'Claude',
    default_format: 'claude',
    paste_target: 'Project instructions / 对话开头',
    url: 'https://claude.ai',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    default_format: 'gemini',
    paste_target: 'Gems 指令 / 对话开头',
    url: 'https://gemini.google.com',
  },
  {
    id: 'character_ai',
    name: 'Character.AI',
    default_format: 'system_prompt',
    paste_target: '角色定义 / 对话开头',
    url: 'https://character.ai',
  },
  {
    id: 'grok',
    name: 'Grok',
    default_format: 'universal',
    paste_target: '对话开头 / 系统提示',
    url: 'https://x.com/i/grok',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    default_format: 'universal',
    paste_target: '对话开头',
    url: 'https://chat.deepseek.com',
  },
  {
    id: 'manual',
    name: '手动录入',
    default_format: 'universal',
    paste_target: '任意位置',
    url: null,
  },
  {
    id: 'other',
    name: '其他网页 AI',
    default_format: 'universal',
    paste_target: '对话开头',
    url: null,
  },
];
