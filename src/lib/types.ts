/** 批评空间地址 */
export type ErogamescapeUrl =
  'http://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki' |
  'https://erogamescape.org/~ap2/ero/toukei_kaiseki' |
  'https://ero.plumz.me';

/** 萌百域名 */
export type MoegirlHost = 'zh.moegirl.org.cn' | 'mzh.moegirl.org.cn';

/** 萌百请求传参 */
export type ApiParams = Record<string, string | number | boolean | string[] | number[] | undefined>;

/** 批评空间出演记录 */
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
export interface CreatorRecord {
  id: number;
  name: string;
  /** 出演作品数量 */
  voice_count: number;
  /** 音乐作品数量 */
  music_count: number;
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

/** 声优作品查询结果 */
export interface QueryResult {
  /** 出演角色 */
  acting: GameRecord[];
  /** 音乐作品 */
  music: GameRecord[];
  /** 创作者信息 */
  creatorInfo: CreatorInfo;
}
