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

/** 批评空间作品（游戏）搜索结果 */
export interface GameSearchResult {
  /** 作品 id（后端按字符串返回） */
  id: string;
  /** 游戏名（gamelist.gamename） */
  gamename: string;
  /** 发售日期（gamelist.sellday） */
  sellday: string;
  /** 制作组织名（brandlist.brandname） */
  brandname: string;
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

/** 根据关键词搜索作品 */
export async function searchGames(keyword: string): Promise<GameSearchResult[]> {
  const res = await invoke<ErogamescapeResponse<GameSearchResult[]>>('search_games', { keyword });
  return unwrap(res);
}

/** 批评空间作品移植版信息（用于补充平台与发行商） */
export interface WorkTransplant {
  /** 移植版平台（批评空间 model） */
  model: string;
  /** 移植版发售日期（gamelist.sellday） */
  sellday: string;
  /** 移植版制作组织名 */
  brand: string;
}

/** 批评空间作品详情（queryWorkDetail 返回） */
export interface WorkDetail {
  /** 游戏名（原名） */
  gamename: string;
  /** 发售日期（gamelist.sellday） */
  sellday: string;
  /** 平台（批评空间 model，通常为首发平台如 PC） */
  model: string;
  /** 游戏官方主页URL（gamelist.shoukai） */
  shoukai: string;
  /** DLsite 作品ID（gamelist.dlsite_id） */
  dlsiteId: string;
  /** DLsite 站点域段（gamelist.dlsite_domain，如 maniax/home），用于拼接作品页 URL */
  dlsiteDomain: string;
  /** 作品 twitter（gamelist.twitter，账号名或完整URL） */
  twitter: string;
  /** 制作组织名（brandlist.brandname） */
  brand: string;
  /** 移植版列表（transplant 关联） */
  transplants: WorkTransplant[];
  /** 续作游戏名列表（sequel 关联） */
  sequels: string[];
  /** STAFF/CAST 列表（shubetu=5 声优 → CAST；1/2/3/7 → STAFF） */
  staff: StaffRecord[];
}

/** 批评空间作品 STAFF/CAST 记录 */
export interface StaffRecord {
  /** 职种：1:原画 2:编剧 3:音乐 5:声优 6:歌手 7:其他 */
  shubetu: string;
  /** 担当区分：1:主要 2:次要 3:其他 */
  shubetuDetail: string;
  /** 职种细分名（声优为角色名，歌手为`OP曲「曲名」`格式，其他职种为职种名） */
  shubetuDetailName: string;
  /** 创作者名 */
  name: string;
}

/** 根据作品 id 读取作品详情（含移植/续作关联） */
export async function queryWorkDetail(workId: number) {
  const res = await invoke<ErogamescapeResponse<WorkDetail>>('query_work_detail', { workId });
  return unwrap(res);
}

/** 批评空间音乐创作者详情（per-song 作词/作曲/编曲/歌手，来自 music.php 详情页） */
export interface MusicCreatorDetail {
  /** 音乐 id */
  musicId: string;
  /** 曲名（来自作品页 #music_summary_main） */
  songName: string;
  /** 歌手名列表（多人时每个为一项） */
  singer: string[];
  /** 作词列表（未获取到为空数组） */
  lyricist: string[];
  /** 作曲列表（未获取到为空数组） */
  composer: string[];
  /** 编曲列表（未获取到为空数组） */
  arranger: string[];
}

/** 获取作品的音乐详情（爬 game.php + music.php，最大 3 并发，部分失败不阻断） */
export async function queryWorkMusicDetail(workId: number) {
  const res = await invoke<ErogamescapeResponse<MusicCreatorDetail[]>>('query_work_music_detail', { workId });
  return unwrap(res);
}
