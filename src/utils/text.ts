import type { CreatorInfo } from '@/lib/types';

/** 半角感叹号和问号转换为全角 */
export const normalizePunctuation = (text: string) => {
  return text.replace(/!/g, '！').replace(/\?/g, '？');
};

/** 判断字符串是否只包含数字 */
export const isNumeric = (str: string) => /^\d+$/.test(str.trim());

/** 片假名转换为平假名 */
export const kataToHira = (text: string) => {
  return text.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
};

/** 如果文本包含假名则包装为 {{lj|...}} 模板，同时统一全角标点 */
export const wrapLj = (text: string) => {
  const normalized = normalizePunctuation(text);
  return /[\u3041-\u3096\u30a1-\u30f6]/.test(text) ? `{{lj|${normalized}}}` : normalized;
};

/**
 * 根据创作者信息生成 wikitext 外部链接列表
 *
 * 每个非空字段生成一行 `* [url text]` 格式的 wikitext。
 */
export function generateExternalLinksWikitext(info: Partial<CreatorInfo>): string {
  const lines: string[] = [];
  if (info.url) {
    lines.push(`* [${info.url} 个人主页]`);
  }
  if (info.twitterUsername) {
    lines.push(`* [https://x.com/${info.twitterUsername} X（原twitter）]`);
  }
  if (info.pixiv) {
    lines.push(`* [https://www.pixiv.net/users/${info.pixiv} pixiv]`);
  }
  if (info.blog) {
    lines.push(`* [${info.blog} 个人博客]`);
  }
  return lines.join('\n');
}
