import type { GameConnectionKind } from '@/api/erogamescape';

/** 批评空间职业类别映射 */
export const shokushuLabels: Record<string, string> = {
  1: '原画',
  2: '编剧',
  3: '音乐',
  4: '角色设计',
  5: '声优',
  6: '歌手',
  7: '其他',
};

/** 批评空间职业类别详细映射 */
export const shokushuDetailLabels: Record<string, string> = {
  1: '主要',
  2: '次要',
  3: '其他',
};

/** 批评空间游戏关联类型映射 */
export const gameConnectionKindLabels: Record<GameConnectionKind, string> = {
  fandisk: 'Fan Disk',
  apend: '追加篇',
  remake: '重制版',
};

/** 单个平台的展示与链接信息 */
export interface PlatformInfo {
  /** 平台显示名（也用作分类名主体，除非显式指定 category） */
  label: string;
  /** 内链：true 表示 `[[label]]`，字符串表示带管道 `[[link|label]]`；省略表示不加内链 */
  link?: string | true;
  /** 分类名主体（拼成 `[[分类:category游戏]]`），默认取 label；萌百无对应分类时设为 null */
  category?: string | null;
}

/**
 * 批评空间平台代码（gamelist.model）到平台信息的映射
 *
 * 同时服务于作品条目生成的「平台」字段（内链）与「平台分类」（`[[分类:XX游戏]]`）：
 * - `link` 控制内链形式：`true`→`[[label]]`，字符串→`[[link|label]]`，省略→纯文本
 * - `category` 控制分类名，默认同 `label`；萌百无对应分类（见 docs/platform_categories.txt）时为 `null`
 */
export const platforms: Record<string, PlatformInfo> = {
  PC: { label: 'Windows' },

  // 任天堂
  NS: { label: 'Nintendo Switch', link: true },
  NS2: { label: 'Nintendo Switch 2', link: true },
  NDS: { label: 'Nintendo DS', link: true },
  '3DS': { label: 'Nintendo 3DS', link: true },
  SFC: { label: 'Super Famicom', link: true },
  FC: { label: 'Family Computer', link: true },
  'GBA(GB)': { label: 'Game Boy', link: true },
  Wii: { label: 'Wii', link: true },
  'Wii U': { label: 'Wii U', link: true },

  // 索尼
  PS: { label: 'PlayStation', link: true },
  PS2: { label: 'PlayStation 2', link: true },
  PS3: { label: 'PlayStation 3', link: true },
  PS4: { label: 'PlayStation 4', link: true },
  PS5: { label: 'PlayStation 5', link: true },
  PSP: { label: 'PlayStation Portable', link: true },
  PSV: { label: 'PlayStation Vita', link: true },

  // 微软
  XB: { label: 'Xbox', link: 'Xbox娘' },
  XB360: { label: 'Xbox 360', link: 'Xbox 360娘' },
  XBO: { label: 'Xbox One', link: true },
  XSX: { label: 'Xbox Series X/S', link: true },

  // 世嘉
  DC: { label: 'Dreamcast' },
  MCD: { label: 'Mega-CD', category: null },
  SS: { label: 'Sega Saturn' },

  // 移动
  Android: { label: 'Android', link: 'Android娘' },
  iOS: { label: 'iOS', link: true },
  iPhone: { label: 'iOS', link: true },

  // 其他（萌百无对应分类）
  'PC-FX': { label: 'NEC PC-FX', category: null },
  PCE: { label: 'PC Engine', link: true, category: null },
  NGP: { label: 'Neo Geo Pocket', category: null },
  WS: { label: 'WonderSwan', category: null },
};

/** 将平台代码映射为 infobox 用的内链文本，未匹配时原样返回 */
export const platformLink = (model: string): string => {
  const info = platforms[model];
  if (!info) { return model; }
  if (info.link === true) { return `[[${info.label}]]`; }
  if (typeof info.link === 'string') { return `[[${info.link}|${info.label}]]`; }
  return info.label;
};

/** 将平台代码映射为萌百平台分类名主体，无对应分类时返回 null */
export const platformCategory = (model: string): string | null => {
  const info = platforms[model];
  if (!info) { return null; }
  return info.category === undefined ? info.label : info.category;
};
