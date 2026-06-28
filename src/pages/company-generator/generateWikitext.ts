import dayjs from 'dayjs';
import type { BangumiCompany, CompanyData, VndbCompany, Work } from '@/api/company';
import { normalizePunctuation, wrapLj } from '@/utils/text';

/**
 * 解析作品名显示文本
 *
 * 有萌百条目则内链：条目名与原名一致用 `[[条目]]`，否则用管道符显示原名 `[[条目|原名]]`；
 * 无条目则用 wrapLj 包装原名（含假名时加 `{{lj|}}`）。
 */
function resolveWorkDisplay(title: string, gameMap: Map<string, string>): string {
  const selfArticle = gameMap.get(normalizePunctuation(title));
  if (selfArticle) {
    return selfArticle === title ? `[[${selfArticle}]]` : `[[${selfArticle}|${wrapLj(title)}]]`;
  }
  return wrapLj(title);
}

/** 格式化作品发行日期为 `YYYY年M月D日`，无日期返回空串 */
const formatDate = (date: string | null): string => {
  if (!date) { return ''; }
  const d = dayjs(date, 'YYYY-MM-DD', true);
  return d.isValid() ? d.format('YYYY年M月D日') : date;
};

/** 生成单个作品行：`*《原名》（中文名）（日期）` */
function buildWorkLine(work: Work, gameMap: Map<string, string>): string {
  let line = `*《${resolveWorkDisplay(work.original_title, gameMap)}》`;
  if (work.chinese_title && work.chinese_title !== work.original_title) {
    line += `（${work.chinese_title}）`;
  }
  const date = formatDate(work.date);
  if (date) {
    line += `（${date}）`;
  }
  return line;
}

/** 生成「作品列表」章节，含 Galgame/动画/音乐/书籍四子节，空分类为「暂无」 */
function buildWorks(data: CompanyData, gameMap: Map<string, string>): string {
  const sections: [string, Work[]][] = [
    ['Galgame', data.galgames],
    ['游戏衍生动画', data.anime],
    ['游戏衍生音乐', data.music],
    ['游戏衍生书籍', data.book],
  ];
  const parts = sections.map(([title, works]) => {
    const body = works.length === 0
      ? '暂无'
      : works.map((w) => buildWorkLine(w, gameMap)).join('\n');
    return `=== ${title} ===\n\n${body}`;
  });
  return `== 作品列表 ==\n\n${parts.join('\n\n')}`;
}

/** 生成「外部链接」章节（仅官网，VNDB 条目用模板放在章节首行） */
function buildExternalLinks(vndb: VndbCompany): string {
  const links: string[] = [];
  if (vndb.official_website) {
    links.push(`* [${vndb.official_website.url} ${vndb.name}官方网站]`);
  }
  return links.join('\n');
}

/**
 * 生成完整的会社条目 wikitext
 *
 * 参考 cv-generator 的拼接方式，逐段组装。会社名固定红链 `[[名]]`，
 * 作品名按 gameMap 解析内链（条目统计），日期用 dayjs 格式化。
 */
export function generateCompanyWikitext(data: CompanyData, gameMap: Map<string, string>): string {
  const { vndb, bangumi } = data;

  // 合并去重别名（VNDB + Bangumi），用顿号连接
  const aliases = [...new Set([...vndb.aliases, ...(bangumi?.aliases ?? [])])].join('、');

  // 官网：VNDB 优先，回退 Bangumi
  const website = vndb.official_website ?? bangumi?.official_website ?? null;
  const websiteText = website ? `[${website.url} ${website.label}]` : '';

  const sections: string[] = [];

  // 页顶模板
  sections.push('{{欢迎编辑}}', '{{长期关注及更新}}');

  // Company Infobox
  sections.push(
    '{{Company Infobox',
    `|标题         = ${vndb.name}`,
    '|image        = ',
    '|图片大小     = 280px',
    `|图片信息     = ${vndb.name}LOGO`,
    '|tabs         =',
    `|公司名称     = ${vndb.name}`,
    `|公司别名     = ${aliases}`,
    '|公司类型     = Galgame会社',
    '|前身         =',
    '|后继         =',
    '|成立时间     =',
    '|结束时间     =',
    '|总部地址     =',
    '|员工人数     =',
    '|母公司       =',
    '|子公司       =',
    '|主要作品     =',
    '|创办人       =',
    '|相关人物     =',
    '|相关公司     =',
    `|网址         = ${websiteText}`,
    '}}',
    '',
    `'''[[${vndb.name}]]'''是日本的一家[[Galgame]]制作会社。`,
    '',
    '== 简介 ==',
    '',
    vndb.description,
    '',
    buildWorks(data, gameMap),
    '',
    '{{Galgame公司}}',
    '',
    '==外部链接与注释==',
    '',
    `{{到VNDB|p${vndb.id}=${vndb.name}}}`,
    '<references />',
    buildExternalLinks(vndb),
    '',
    '[[Category:Galgame公司]]',
  );

  return sections.join('\n');
}

/**
 * 归一化名称用于一致性比对：转小写、去空白与常见分隔符
 */
const normalizeName = (value: string): string =>
  value
    .toLowerCase()
    .split('')
    .filter((c) => !/\s/.test(c) && !'-_・･.,，。'.includes(c))
    .join('');

/** 归一化网址用于官网比对：去协议、去 www、去尾斜杠、转小写 */
const normalizeWebsite = (url: string): string =>
  url
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .toLowerCase();

/**
 * 校验 VNDB 与 Bangumi 是否同一主体
 *
 * 名称集合相交或官网归一化相等即通过；否则返回警告文案（不阻断，由调用方决定是否继续）。
 */
export function ensureSameCompany(
  vndb: VndbCompany,
  bangumi: BangumiCompany,
): { ok: true } | { ok: false; message: string } {
  const vndbNames = new Set([vndb.name, ...vndb.aliases].map(normalizeName).filter(Boolean));
  const bgmNames = new Set([bangumi.name, ...bangumi.aliases].map(normalizeName).filter(Boolean));
  const nameMatch = [...vndbNames].some((n) => bgmNames.has(n));

  const websiteMatch = vndb.official_website && bangumi.official_website
    ? normalizeWebsite(vndb.official_website.url) === normalizeWebsite(bangumi.official_website.url)
    : false;

  if (nameMatch || websiteMatch) {
    return { ok: true };
  }
  return {
    ok: false,
    message: `VNDB 与 Bangumi 公司信息可能不一致：VNDB=${vndb.name}，Bangumi=${bangumi.name}。如确认无误，可忽略此警告继续生成。`,
  };
}
