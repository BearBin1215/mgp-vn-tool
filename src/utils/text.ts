import type { CreatorInfo } from '@/api/erogamescape';

/** 半角感叹号和问号转换为全角 */
export const normalizePunctuation = (text: string) => {
  return text.replace(/!/g, '！').replace(/\?/g, '？');
};

/** 判断字符串是否只包含数字 */
export const isNumeric = (str: string) => /^\d+$/.test(str.trim());

/**
 * 从搜索输入解析待查询的实体 id
 *
 * 优先取已选下拉项的 id；否则当输入为纯数字时视为直接输入的 id。
 * 两者皆不满足时返回 null。
 */
export const resolveInputId = (
  selectedId: string | null,
  searchValue: string,
): string | null => {
  if (selectedId) {
    return selectedId;
  }
  const trimmed = searchValue.trim();
  return isNumeric(trimmed) ? trimmed : null;
};

/** 片假名转换为平假名 */
export const kataToHira = (text: string) => {
  return text.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
};

/**
 * 生成 `{{日本人名}}` 模板文本
 *
 * 批评空间返回的假名（片假名）不带空格，无法直接区分姓与名的读音。
 * 当声优名为「汉字姓＋假名名」时（如「天季ひより」，假名「アマキヒヨリ」），
 * 可据名字中最后一个汉字的位置切出假名尾缀（名的书写形式），再从假名中剥离出姓的读音，
 * 生成 `{{日本人名|天季|あまき|ひより}}`；其余情况退化为 `{{日本人名|姓名|假名}}`。
 */
export const buildJapaneseNameTemplate = (name: string, furigana: string) => {
  const hira = kataToHira(furigana);

  // 名字中最后一个汉字的位置，其后即为假名尾缀（名的书写形式）
  let lastKanjiIdx = -1;
  for (let i = 0; i < name.length; i++) {
    // 汉字正则判断
    if (/[々-〇㐀-鿿]/.test(name[i]!)) {
      lastKanjiIdx = i;
    }
  }

  if (lastKanjiIdx !== -1 && lastKanjiIdx < name.length - 1) {
    const surnameKanji = name.slice(0, lastKanjiIdx + 1);
    const givenKana = kataToHira(name.slice(lastKanjiIdx + 1));
    // 假名尾缀需非空、且为完整假名的后缀，同时姓的读音非空
    if (givenKana && hira.endsWith(givenKana) && hira.length > givenKana.length) {
      const surnameReading = hira.slice(0, hira.length - givenKana.length);
      return `{{日本人名|${surnameKanji}|${surnameReading}|${givenKana}}}`;
    }
  }

  // 不满足汉字姓+假名名，使用最基础的 {{日本人名|姓名|假名}} 自行修改
  return `{{日本人名|${name}|${hira}}}`;
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
