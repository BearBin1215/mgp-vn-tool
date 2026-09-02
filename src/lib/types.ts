/** 批评空间全部可选地址（均不含尾斜杠），为 ErogamescapeUrl 类型的事实来源 */
export const EROGAMESCAPE_URLS = [
  'http://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki',
  'https://erogamescape.org/~ap2/ero/toukei_kaiseki',
  'https://ero.plumz.me',
] as const;

/** 批评空间地址，由 EROGAMESCAPE_URLS 推导 */
export type ErogamescapeUrl = (typeof EROGAMESCAPE_URLS)[number];

/** 检查值是否为有效的批评空间地址 */
export function isErogamescapeUrl(value: unknown): value is ErogamescapeUrl {
  return typeof value === 'string' && (EROGAMESCAPE_URLS as readonly string[]).includes(value);
}

/** 萌百域名 */
export type MoegirlHost = 'zh.moegirl.org.cn' | 'mzh.moegirl.org.cn';

/** 萌百请求传参 */
export type ApiParams = Record<string, string | number | boolean | string[] | number[] | undefined>;
