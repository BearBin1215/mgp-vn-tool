import type { GameConnectionKind } from './types';

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
