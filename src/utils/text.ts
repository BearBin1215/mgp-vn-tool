import dayjs from 'dayjs';
import type { CreatorInfo } from '@/api/erogamescape';
import type { PageInfo } from '@/api/moegirl';

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
 * @param name 姓名
 * @param furigana 假名
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
 * @param info 创作者基础信息
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


/**
 * 根据页面信息返回规范标题
 * @param title 标题
 * @param pageInfoMap 通过萌娘百科接口获取到的页面信息
 * @param categories 仅指定分类下页面处理重定向，留空则不检查分类
 */
export const resolveTitle = (
  title: string,
  pageInfoMap?: Map<string, PageInfo>,
  categories: string[] = [],
): string => {
  if (!title) {
    return '';
  }
  const info = pageInfoMap?.get(title);
  if (info && info.pageId !== null && (categories.length === 0 || info.categories.some((c) => categories.includes(c)))) {
    return info.title;
  }
  return title;
};

/**
 * 解析内链
 *
 * 固定添加内链（不管页面是否存在）：复用 resolveTitle 取规范标题作内链。
 * @param title 标题
 * @param pageInfoMap 通过萌娘百科接口获取到的页面信息
 * @param categories 仅指定分类下页面处理重定向，留空则不检查分类
 */
export const resolveInternalLink = (
  title: string,
  pageInfoMap?: Map<string, PageInfo>,
  categories: string[] = [],
): string => {
  if (!title) {
    return '';
  }
  return `[[${resolveTitle(title, pageInfoMap, categories)}]]`;
};

/**
 * 按萌百页面信息为标题添加内链。
 *
 * 页面信息未获取、页面不存在或分类不匹配时，仅返回 `wrapLj` 包装后的显示文本，不添加内链。
 * @param title 页面标题或显示文本
 * @param pageInfoMap 通过萌娘百科接口获取到的页面信息
 * @param categories 仅指定分类下页面处理重定向，留空则不检查分类
 */
export const resolveOptionalInternalLink = (
  title: string,
  pageInfoMap: Map<string, PageInfo> | undefined,
  categories: string[] = [],
): string => {
  if (!pageInfoMap) {
    return wrapLj(title);
  }
  const info = pageInfoMap.get(title);
  if (!info || info.pageId === null || (categories.length > 0 && !info.categories.some((c) => categories.includes(c)))) {
    return wrapLj(title);
  }
  return `[[${info.title}]]`;
};

/**
 * 解析大家族模板：当 `Template:{name}` 存在于 pageInfoMap 中时返回 `{{name}}`，否则返回 null。
 * @param name 模板名称（不含 `Template:` 前缀）
 * @param pageInfoMap 通过萌娘百科接口获取到的页面信息
 */
export const resolveFamilyTemplate = (
  name: string,
  pageInfoMap?: Map<string, PageInfo>,
): string | null => {
  if (!name || !pageInfoMap) {
    return null;
  }
  const info = pageInfoMap.get(`Template:${name}`);
  return info && info.pageId !== null ? `{{${name}}}` : null;
};

/**
 * 格式化日期字符串为中文格式 `YYYY年M月D日`
 *
 * 空值返回空串；无效日期原样返回。
 * @param date YYYY-MM-DD 格式日期字符串
 */
export const formatDateCN = (date: string | null): string => {
  if (!date) { return ''; }
  const d = dayjs(date, 'YYYY-MM-DD', true);
  return d.isValid() ? d.format('YYYY年M月D日') : date;
};

/** 将任意值格式化为可读的错误信息字符串 */
export const formatError = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/**
 * 从条目 wikitext 源代码中提取游戏发行时间
 *
 * 优先取信息框中的 `|发行时间 = ...` 参数（页面存在多个 Infobox 时取首个，即本篇），
 * 未命中时兜底匹配正文的「于XXXX年X月X日发行/发售」句式。关键字兼容繁简
 * （发行/發行、发售/發售、于/於），「年/月/日」繁简同形无需区分。
 * @param wikitext 页面源代码
 * @returns YYYY-MM-DD 格式日期，无法提取时返回空串
 */
export const extractReleaseDate = (wikitext: string): string => {
  const patterns = [
    /^\s*\|\s*发行时间\s*=\s*(\d{4})年(\d{1,2})月(\d{1,2})日/m,
    /[于於](\d{4})年(\d{1,2})月(\d{1,2})日(?:发行|發行|发售|發售)/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(wikitext);
    if (!match) { continue; }
    const [, y, m, d] = match;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return '';
};

/**
 * 从条目 wikitext 源代码中提取日文原名
 *
 * 优先取信息框的 `|原名 = ` 参数值（可能直接是原名文本，也可能包裹
 * `{{lj|...}}` / `{{lang-ja|'''...'''}}` 等模板或加粗标记）；兜底匹配
 * 正文 `{{lang-ja|...}}` / `{{lj|...}}` 模板。取到原始片段后剥离模板与
 * 加粗标记，保留内部日文原名。
 * @param wikitext 页面源代码
 * @returns 日文原名，无法提取时返回空串
 */
export const extractJa = (wikitext: string): string => {
  const patterns = [
    // 信息框参数：|原名 = （值可能带模板包裹，也可能直接是原名）
    /^\s*\|\s*原名\s*=[ \t]*(.+)/m,
    // 正文 lang-ja / lj 模板
    /\{\{\s*(?:lang-ja|lj)\s*\|\s*'*(.+?)'*\s*\}\}/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(wikitext);
    if (!match) { continue; }
    // 若片段本身还包着模板，先取内部；否则取整段（去首尾空白与加粗引号）
    const inner = /\{\{\s*(?:lang-ja|lj)\s*\|\s*'*(.+?)'*\s*\}\}/.exec(match[1]);
    const raw = (inner ? inner[1] : match[1]).replace(/^'+|'+$/g, '').trim();
    if (raw) { return raw; }
  }
  return '';
};

/**
 * 将 wikitext 内链统一转换为目标页面标题。
 * @param text 原始 wikitext 片段
 * @returns 去除内链标记后的文本
 */
const normalizeBrandText = (text: string): string => text
  .replace(/\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/g, '$1')
  .replace(/<br\s*\/?>(.*)$/i, '')
  .trim();

/**
 * 从条目 wikitext 源代码中提取制作组织。
 *
 * 仅识别顶部信息框的 `开发/開發` 参数，以及序言中的「由…制作/製作、
 * 开发/開發、创作/創作」句式。两种句式均支持普通文本和 `[[内链]]`。
 * @param wikitext 页面源代码
 * @returns 制作组织名，无法提取时返回空串
 */
export const extractBrand = (wikitext: string): string => {
  // 序言和顶部信息框位于首个二级标题之前，后续章节不参与会社提取。
  const preface = wikitext.split(/\n\s*==/u, 1)[0];

  // 信息框通常位于页面开头；取首个参数，避免误读正文或其他模板中的同名字段。
  const infoboxMatch = /^\s*\|\s*(?:开发|開發)\s*=\s*(.*?)\s*$/m.exec(preface);
  if (infoboxMatch) {
    const brand = normalizeBrandText(infoboxMatch[1]);
    if (brand) { return brand; }
  }

  // 序言位于首个二级标题之前，避免把正文后续章节中的其他公司描述当作主导会社。
  const normalizedPreface = normalizeBrandText(preface);
  const proseMatch = /由\s*([^\n，。；、]{1,80}?)\s*(?:制作|製作|开发|開發|创作|創作)/u.exec(normalizedPreface);
  if (proseMatch) {
    const brand = normalizeBrandText(proseMatch[1]);
    if (brand) { return brand; }
  }
  return '';
};
