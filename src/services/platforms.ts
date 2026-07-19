/**
 * Platform metadata is intentionally minimal.
 * This app stores character memory only — no third-party AI product integration.
 */

export type PlatformDef = {
  id: string;
  name: string;
  default_format: string;
  paste_target: string;
  url: string | null;
};

/** Kept for API compatibility; only generic manual entry. */
export const PLATFORMS: PlatformDef[] = [
  {
    id: 'manual',
    name: '手动录入',
    default_format: 'universal',
    paste_target: '任意位置',
    url: null,
  },
];
