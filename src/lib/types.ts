/** 批评空间地址 */
export type ErogamescapeUrl =
  'http://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki' |
  'https://erogamescape.org/~ap2/ero/toukei_kaiseki' |
  'https://ero.plumz.me';

/** 萌百域名 */
export type MoegirlHost = 'zh.moegirl.org.cn' | 'mzh.moegirl.org.cn';

/** 萌百请求传参 */
export type ApiParams = Record<string, string | number | boolean | string[] | number[] | undefined>;
