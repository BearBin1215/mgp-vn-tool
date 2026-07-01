import { groupBy, uniq } from 'lodash-es';
import type { VndbProducer, VndbWork } from '@/api/vndb';
import type { BangumiCompany, BangumiWork } from '@/api/bangumi';
import { normalizePunctuation, wrapLj, formatDateCN } from '@/utils/text';

/** 会社条目生成的原始数据（前端渲染 wikitext 所需） */
export interface CompanyData {
  vndb: VndbProducer;
  bangumi: BangumiCompany | null;
  galgames: VndbWork[];
  anime: BangumiWork[];
  music: BangumiWork[];
  book: BangumiWork[];
}

/** buildWorkLine 的统一输入：从 VndbWork / BangumiWork 归一化而来 */
interface WorkLineInput {
  originalTitle: string;
  chineseTitle: string | null;
  date: string | null;
  note: string | null;
}

/** 将 VndbWork 归一化为 WorkLineInput */
const fromVndb = (w: VndbWork): WorkLineInput => ({
  originalTitle: w.original_title,
  chineseTitle: w.chinese_title,
  date: w.date,
  note: w.note,
});

/** 将 BangumiWork 归一化为 WorkLineInput */
const fromBangumi = (w: BangumiWork): WorkLineInput => ({
  originalTitle: w.name,
  chineseTitle: w.name_cn,
  date: w.date,
  note: w.note,
});

/**
 * 解析原名显示文本（不含内链）。
 *
 * 原名用 wrapLj 包装（含假名时加 `{{lj|}}`），内链改在译名位置生成。
 */
function resolveOriginalDisplay(title: string): string {
  return wrapLj(title);
}

/**
 * 解析译名显示文本（含内链）。
 *
 * 有萌百条目则 `[[条目]]`，无则返回纯译名。
 */
function resolveChineseDisplay(chineseTitle: string, gameMap: Map<string, string>): string {
  const article = gameMap.get(normalizePunctuation(chineseTitle));
  return article ? `[[${article}]]` : chineseTitle;
}

/**
 * 解析原名显示文本（含内链），仅用于无中文译名时的回退。
 *
 * 有萌百条目则内链：条目名与原名一致用 `[[条目]]`，否则 `[[条目|原名]]`；无则 wrapLj。
 */
function resolveOriginalDisplayWithLink(title: string, gameMap: Map<string, string>): string {
  const article = gameMap.get(normalizePunctuation(title));
  if (article) {
    return article === title ? `[[${article}]]` : `[[${article}|${wrapLj(title)}]]`;
  }
  return wrapLj(title);
}

/** 格式化作品发行日期为 `YYYY年M月D日`，无日期返回空串 */
const formatDate = (date: string | null): string => formatDateCN(date);

/**
 * 生成单个作品行：`*《原名》（译名）（日期）`。
 *
 * 内链生成在译名位置：有中文译名时《原名》纯展示、（译名）用内链；
 * 无中文译名时回退到《原名》内链。depth 控制缩进层级（1=主作品 `*`，2=衍生 `**`）；
 * note 追加到行尾。
 */
function buildWorkLine(work: WorkLineInput, gameMap: Map<string, string>, depth = 1, note = ''): string {
  const prefix = '*'.repeat(depth);
  const { originalTitle, chineseTitle } = work;
  const hasChinese = !!chineseTitle && chineseTitle !== originalTitle;
  // 有译名：原名纯展示，译名位置生成内链；无译名：原名位置生成内链
  const titleText = hasChinese
    ? resolveOriginalDisplay(originalTitle)
    : resolveOriginalDisplayWithLink(originalTitle, gameMap);
  let line = `${prefix} 《${titleText}》`;
  if (hasChinese) {
    line += `（${resolveChineseDisplay(chineseTitle!, gameMap)}）`;
  }
  const date = formatDate(work.date);
  if (date) {
    line += `（${date}）`;
  }
  const workNote = note || work.note || '';
  if (workNote) {
    line += ` ${workNote}`;
  }
  return line;
}

/** 触发缩进的关联类型：本作的「原作」（orig）。
 *
 * 仅 orig 表示本作明确衍生自某原作，应缩进到原作下方。preq(前传)/seq(续作)/set(同世界观)
 * 是平级主线关系，不缩进；fan 是反向关系（关联对象是本作的 fan disc），不用于本作缩进。
 */
const DERIVED_RELATION = 'orig';

interface WorkGroup {
  /** 主作品 */
  main: VndbWork;
  /** 紧随主作品的衍生作品（按发售日升序） */
  derived: VndbWork[];
  /** 主作品是否关联多部原作，需追加人工确认注释 */
  mainNeedsNote: boolean;
}

/** 比较两个发售日，空/无效日期排末尾 */
function compareByDate(a: VndbWork, b: VndbWork): number {
  const ta = a.date ? new Date(a.date).getTime() || Infinity : Infinity;
  const tb = b.date ? new Date(b.date).getTime() || Infinity : Infinity;
  return ta - tb;
}

/**
 * 按关联关系将作品分组为「主作品 + 其衍生」，保证两级层级且无丢失。
 *
 * - 恰好 1 个 orig（原作在列表内）→ 衍生，缩进到原作下方；
 * - ≥2 个 orig → 主作品（不缩进），标记需人工确认（原作不唯一）；
 * - 0 个 orig、或唯一 orig 不在列表 → 主作品。
 * preq/seq/set 是平级关系不触发缩进。
 *
 * 仅保留两级：若某衍生的原作本身也是衍生（链条），将该衍生提升为主作品，避免超过两级
 * 而丢失。主作品与衍生各自按发售日升序排序。
 */
function groupWorksByRelation(works: VndbWork[]): WorkGroup[] {
  const idSet = new Set(works.map((w) => w.id));
  // 每个作品的父作品 id（唯一在列表内的 orig），无则 null
  const parentOf = new Map<string, string | null>();
  const multiOrig = new Set<string>();
  for (const work of works) {
    const origs = work.relations.filter((r) => r.relation === DERIVED_RELATION && r.id !== work.id);
    if (origs.length === 1 && idSet.has(origs[0].id)) {
      parentOf.set(work.id, origs[0].id);
    } else {
      parentOf.set(work.id, null);
      if (origs.length >= 2) {
        multiOrig.add(work.id);
      }
    }
  }

  // 是否为主作品：无父作品，或父作品本身也是衍生（链条，提升以防丢失）
  const isRoot = (id: string): boolean => {
    const parent = parentOf.get(id);
    if (!parent) { return true; }
    const grandparent = parentOf.get(parent);
    return grandparent !== null && grandparent !== undefined;
  };

  const roots = works.filter((w) => isRoot(w.id));
  const derivedWorks = works.filter((w) => !isRoot(w.id));
  const derivedByParent = groupBy(derivedWorks, (w) => parentOf.get(w.id)!);

  roots.sort(compareByDate);
  for (const list of Object.values(derivedByParent)) {
    list.sort(compareByDate);
  }

  return roots.map((main) => ({
    main,
    derived: derivedByParent[main.id] ?? [],
    mainNeedsNote: multiOrig.has(main.id),
  }));
}

/** 生成「作品列表」章节，含 Galgame/动画/音乐/书籍四子节，空分类为「暂无」 */
function buildWorks(data: CompanyData, gameMap: Map<string, string>): string {
  // Galgame 节按关联关系分组：衍生作品缩进到主作品下方
  const galgameBody = data.galgames.length === 0
    ? '暂无'
    : groupWorksByRelation(data.galgames)
      .flatMap((group) => [
        buildWorkLine(fromVndb(group.main), gameMap, 1, group.mainNeedsNote ? '<!-- 关联多部原作，需要手动确认 -->' : ''),
        ...group.derived.map((w) => buildWorkLine(fromVndb(w), gameMap, 2)),
      ])
      .join('\n');

  // 其余节为扁平列表（无关联数据）
  const flatSections: [string, BangumiWork[]][] = [
    ['游戏衍生动画', data.anime],
    ['游戏衍生音乐', data.music],
    ['游戏衍生书籍', data.book],
  ];
  const flatParts = flatSections.map(([title, works]) => {
    const body = works.length === 0
      ? '暂无'
      : works.map((w) => buildWorkLine(fromBangumi(w), gameMap, 1)).join('\n');
    return `=== ${title} ===\n\n${body}`;
  });

  const parts = [`=== Galgame ===\n\n${galgameBody}`, ...flatParts];
  return `== 作品列表 ==\n\n${parts.join('\n\n')}`;
}

/** 生成「外部链接」章节（官网、X、YouTube；VNDB 条目用模板放在章节首行） */
function buildExternalLinks(vndb: VndbProducer): string {
  const links: string[] = [];
  if (vndb.official_website) {
    links.push(`* [${vndb.official_website} ${vndb.name}官方网站]`);
  }
  if (vndb.twitter) {
    links.push(`* [${vndb.twitter} X（原twitter）]`);
  }
  if (vndb.youtube) {
    links.push(`* [${vndb.youtube} YouTube]`);
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
  const aliases = uniq([...vndb.aliases, ...(bangumi?.aliases ?? [])]).join('、');

  // 官网：VNDB 优先，回退 Bangumi
  const website = vndb.official_website ?? bangumi?.official_website ?? null;
  const websiteText = website ? `[${website} ${vndb.name}官方网站]` : '';

  const sections: string[] = [];

  // 页顶模板
  sections.push('{{欢迎编辑}}', '{{长期关注及更新}}');

  // Company Infobox
  sections.push(
    '{{Company Infobox',
    `|标题         = ${vndb.name}`,
    '|image        =',
    '|图片信息     =',
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
    '== 外部链接与注释 ==',
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
  vndb: VndbProducer,
  bangumi: BangumiCompany,
): { ok: true } | { ok: false; message: string } {
  const vndbNames = new Set([vndb.name, ...vndb.aliases].map(normalizeName).filter(Boolean));
  const bgmNames = new Set([bangumi.name, ...bangumi.aliases].map(normalizeName).filter(Boolean));
  const nameMatch = [...vndbNames].some((n) => bgmNames.has(n));

  const websiteMatch = vndb.official_website && bangumi.official_website
    ? normalizeWebsite(vndb.official_website) === normalizeWebsite(bangumi.official_website)
    : false;

  if (nameMatch || websiteMatch) {
    return { ok: true };
  }
  return {
    ok: false,
    message: `VNDB 与 Bangumi 公司信息可能不一致：VNDB=${vndb.name}，Bangumi=${bangumi.name}。如确认无误，可忽略此警告继续生成。`,
  };
}
