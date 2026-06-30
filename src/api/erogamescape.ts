import { invoke } from '@tauri-apps/api/core';

/** 后端统一响应包装 */
export interface ErogamescapeResponse<T> {
  statusCode: string;
  result: 'success' | 'fail';
  response: T;
}

/** 处理后端批评空间响应 */
export function unwrap<T>(res: ErogamescapeResponse<T>): T {
  if (res.result === 'fail') {
    throw new Error(String(res.response || '批评空间请求失败'));
  }
  return res.response;
}

/** 批评空间创作者参与单部作品的记录（出演/音乐） */
export interface GameRecord {
  /** 1:メイン 2:サブ 3:その他 */
  shubetuDetail: string;
  /** 参与详情，例如声优配音角色名 */
  shubetuDetailName: string;
  /** 游戏名 */
  gameName: string;
  /** 发售日期 */
  sellDay: string;
  /** 平台 */
  model: string;
}

/** 批评空间创作者搜索结果 */
export interface CreatorSearchResult {
  /** 创作者 id（后端按字符串返回） */
  id: string;
  name: string;
  /** 出演作品数量 */
  voiceCount: number;
  /** 音乐作品数量 */
  musicCount: number;
}

/** 批评空间创作者信息 */
export interface CreatorInfo {
  name: string;
  /** 假名 */
  furigana: string;
  /** 个人主页地址 */
  url: string;
  /** X 用户名 */
  twitterUsername: string;
  /** 个人博客地址 */
  blog: string;
  /** Pixiv ID */
  pixiv: string;
}

/** 游戏关联类型：fandisk=Fan Disk / apend=追加篇 / remake=重制版 */
export type GameConnectionKind = 'fandisk' | 'apend' | 'remake';

/** 游戏关联（Fan Disk / 追加篇 / 重制版）关系 */
export interface GameConnection {
  /** 关联类型 */
  kind: GameConnectionKind;
  /** 关联主体游戏名（衍生作品） */
  subjectGameName: string;
  /** 关联客体游戏名（原作） */
  objectGameName: string;
}

/** queryCreatorWorks 的返回：创作者作品查询结果 */
export interface CreatorWorksResult {
  /** 出演角色 */
  acting: GameRecord[];
  /** 音乐作品 */
  music: GameRecord[];
  /** 创作者信息 */
  creatorInfo: CreatorInfo;
  /** Fan Disk / 追加篇 / 重制版关联列表 */
  gameConnections: GameConnection[];
}

/** 根据创作者id读取参与作品信息 */
export async function queryCreatorWorks(creatorId: number) {
  const res = await invoke<ErogamescapeResponse<CreatorWorksResult>>('query_creator_works', { creatorId });
  return unwrap(res);
}

/** 根据关键词搜索创作者 */
export async function searchCreators(keyword: string) {
  const res = await invoke<ErogamescapeResponse<CreatorSearchResult[]>>('search_creators', { keyword });
  return unwrap(res);
}
