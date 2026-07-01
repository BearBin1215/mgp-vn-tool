import { groupBy, uniq } from 'lodash-es';
import type { WorkDetail, MusicCreatorDetail, StaffRecord } from '@/api/erogamescape';
import type { PageInfo } from '@/api/moegirl';
import { platformLink, platformCategory } from '@/lib/erogamescapeDict';
import { PENDING_SELL_DATE } from '@/utils/constants';
import { normalizePunctuation, wrapLj, resolveTitle, resolveInternalLink, formatDateCN } from '@/utils/text';

/** 制作组织有效分类：内链解析时仅采纳属于这些分类的页面 */
const VALID_BRAND_CATEGORIES = ['Galgame公司', '日本游戏制作组织', 'BL游戏公司', '同人社团'];

/** 声优有效分类：内链解析时仅采纳属于这些分类的页面 */
const VALID_VOICE_ACTOR_CATEGORIES = ['配音演员', 'R-18作品配音演员'];

/** 音乐相关人员（歌手/作词/作曲/编曲）内链解析的有效分类，符合其一即可 */
const MUSIC_CATEGORIES = ['作曲家', '作词家', '歌手', '音乐人'];

/** STAFF 职种在站内的目标页面属于此处分类时会处理重定向等；空数组表示不解析（固定红链） */
const STAFF_CATEGORY_MAP: Record<string, string[]> = {
  1: ['插画家', '原画师', '漫画家'], // 原画/SD原画
  2: ['编剧', '作家'], // 编剧
  3: MUSIC_CATEGORIES, // 音乐
  7: [], // 其他职种：不解析
};

/**
 * 生成发行商字段文本
 *
 * 原作制作组织在前（无括号）；移植版按制作组织分组，每组以 `制作组织（平台代码）` 形式列出，
 * 与原作相同的制作组织跳过。示例：`[[Key]]<br>[[PROTOTYPE]]（NS、PS4）`。
 */
const buildPublisherText = (detail: WorkDetail, pageInfoMap?: Map<string, PageInfo>): string => {
  const parts: string[] = [resolveInternalLink(detail.brand, pageInfoMap, VALID_BRAND_CATEGORIES)];
  // 移植版按制作组织分组（排除与原作相同的），各平台代码去重后以 `制作组织（平台代码）` 列出
  const portBrands = groupBy(
    detail.transplants.filter((t) => t.brand && t.brand !== detail.brand),
    (t) => t.brand,
  );
  for (const [brand, transplants] of Object.entries(portBrands)) {
    const codes = uniq(transplants.map((t) => t.model).filter(Boolean));
    parts.push(`${resolveInternalLink(brand, pageInfoMap, VALID_BRAND_CATEGORIES)}（${codes.join('、')}）`);
  }
  return parts.join('<br>');
};

/** 格式化发售日期（待定哨兵值显示为「待定」） */
const formatSellDay = (sellday: string): string => {
  if (!sellday || sellday === PENDING_SELL_DATE) { return '待定'; }
  return formatDateCN(sellday);
};

/**
 * 生成发行时间字段文本
 *
 * 原作发售日在前（无括号）；移植版各以 `发售日（平台代码）` 一行，按发售日升序排列。
 * 示例：`2016年9月30日<br>2019年6月20日（NS）`。
 */
const buildReleaseDateText = (detail: WorkDetail): string => {
  // 收集所有版本：原作在前，移植版各带平台代码
  // 移植版发售日待定（2050-01-01）的过滤掉，原作保留
  const entries: { date: string; code?: string }[] = [
    { date: detail.sellday },
    ...detail.transplants
      .filter((t) => t.sellday && t.sellday !== PENDING_SELL_DATE)
      .map((t) => ({ date: t.sellday, code: t.model })),
  ];
  // 按发售日升序排序（待定值 2050-01-01 自然排到最后）
  entries.sort((a, b) => a.date.localeCompare(b.date));
  return entries
    .map((e) => (e.code ? `${formatSellDay(e.date)}（${e.code}）` : formatSellDay(e.date)))
    .join('<br>');
};

/**
 * 生成序言中各移植版的发行说明行
 *
 * 按「同发行商 + 同发售日」分组，每组拼成一句：`<平台代码>版由<发行商>代理`，发售日非待定时追加 `，于<发售日>发行`；
 * 多组以分号分隔，末尾句号。无有效移植版时返回空字符串。
 */
const buildPublisherLines = (detail: WorkDetail, pageInfoMap?: Map<string, PageInfo>): string => {
  // 过滤出有平台代码与发行商的移植版
  const transplants = detail.transplants.filter((t) => t.model && t.brand);
  if (transplants.length === 0) {
    return '';
  }

  // 按发行商 + 发售日分组，组内平台代码去重保持出现顺序
  const groups = new Map<string, { brand: string; sellday: string; codes: string[] }>();
  for (const t of transplants) {
    const key = `${t.brand}|${t.sellday}`;
    const group = groups.get(key);
    if (group) {
      if (!group.codes.includes(t.model)) { group.codes.push(t.model); }
    } else {
      groups.set(key, { brand: t.brand, sellday: t.sellday, codes: [t.model] });
    }
  }

  // 按发售日升序排序（待定值 2050-01-01 自然排到最后）
  const sorted = [...groups.values()].sort((a, b) => a.sellday.localeCompare(b.sellday));
  const sentences = sorted.map((g) => {
    const brandLink = resolveInternalLink(g.brand, pageInfoMap, VALID_BRAND_CATEGORIES);
    const head = `${g.codes.join('、')}版由${brandLink}代理`;
    // 待定发售日省略「，于...发行」
    if (!g.sellday || g.sellday === PENDING_SELL_DATE) {
      return head;
    }
    return `${head}，于${formatSellDay(g.sellday)}发行`;
  });
  return `\n${sentences.join('；')}。`;
};

/** 生成 Video Game Infobox 段（多行模板字面量，未涉及字段保留注释） */
const buildInfobox = (
  detail: WorkDetail,
  articleName: string,
  pageInfoMap?: Map<string, PageInfo>,
): string => {
  // 平台：原作平台 + 移植版平台，去重，一行一个
  const platforms: string[] = [];
  const pushPlatform = (model: string) => {
    const mapped = platformLink(model);
    if (mapped && !platforms.includes(mapped)) { platforms.push(mapped); }
  };
  pushPlatform(detail.model);
  for (const t of detail.transplants) { pushPlatform(t.model); }
  const platformText = platforms.join('<br>');

  // 相关作品：续作游戏名，一行一个
  const sequelText = detail.sequels.map((s) => normalizePunctuation(s)).join('<br>');

  return [
    '{{Video Game Infobox',
    `|标题         = ${articleName}`,
    '|image        =<!-- 此处只需填入文件名，不用再外加[[]]和file:，若需要展示差分则选用下方的tabs并删去此参数 -->',
    '|图片大小     =',
    '|图片信息     =',
    '|tabs         =<!-- 此项一般在展示各版本或系列作品的封面时使用，无需展示多张图片时可删去此参数 -->',
    `|原名         = ${wrapLj(detail.gamename)}`,
    '|官方译名     =<!-- 作品的官方译名，没有官方代理中文的外文作品请勿擅自填写 -->',
    '|常用译名     =<!-- 作品的民间译名以及常用简称 -->',
    '|类型         = [[ADV]]',
    `|平台         = ${platformText}`,
    '|分级         =<!-- 使用{{游戏分级}}模板，请确保分级机构正确，不是所有PC游戏都走EOCS分级 -->',
    '|适龄提示     =<!-- 一般大陆作品填写此项 -->',
    `|开发         = ${resolveInternalLink(detail.brand, pageInfoMap, VALID_BRAND_CATEGORIES)}`,
    `|发行         = ${buildPublisherText(detail, pageInfoMap)}<!-- 不一定和开发相同 -->`,
    '|总监         =<!-- 以下内容按照官网或游戏ED信息填写 -->',
    '|制作人       =',
    '|设计师       =',
    '|角色设计     =',
    '|编剧         =',
    '|程序         =',
    '|美工         =',
    '|音乐         =<!-- 以上内容按照官网或游戏ED信息填写 -->',
    '|引擎         =<!-- 游戏的引擎，不确认时可以不填 -->',
    `|发行时间     = ${buildReleaseDateText(detail)}`,
    '|改编载体     =<!-- 若有动画、漫画等衍生作品则在此处填写 -->',
    `|相关作品     = ${sequelText}`,
    '}}',
  ].join('\n');
};

/**
 * 拆分创作者名为主名与别名
 *
 * 名字格式 `主名(别名1、别名2)`，返回主名与括号内别名（无括号时 alias 为空）。
 */
export const parseStaffName = (name: string): { main: string; alias: string } => {
  const match = name.match(/^([^()]+)\(([^)]*)\)\s*$/);
  if (match) {
    return { main: match[1]!.trim(), alias: match[2]!.trim() };
  }
  return { main: name.trim(), alias: '' };
};

/**
 * 生成 CAST 章节 wikitext
 *
 * 从 staff 中过滤 shubetu=5（声优），一名声优一行。
 * 按担当区分排序（主要→次要→其他），角色名去除空格后按顿号拆分并各自加内链，声优名按声优分类解析内链。
 * 角色名缺失（无法确定配音角色）的声优单独汇总到末行`* 其他：[[声优A]]、[[声优B]]`。无 CAST 数据时返回空字符串。
 */
const buildCast = (detail: WorkDetail, pageInfoMap?: Map<string, PageInfo>) => {
  const cast = detail.staff
    .filter((s) => s.shubetu === '5')
    .map((s) => ({ character: s.shubetuDetailName, actor: s.name, shubetuDetail: s.shubetuDetail }));
  if (cast.length === 0) {
    return '';
  }

  // 角色名缺失的声优单独收集，其余按担当区分排序：1:主要 2:次要 3:其他，未知归到最后
  const sorted = cast
    .filter((c) => c.character)
    .sort((a, b) => +(a.shubetuDetail || 4) - +(b.shubetuDetail || 4));
  const lines = sorted.map((c) => {
    const vaLink = resolveInternalLink(c.actor, pageInfoMap, VALID_VOICE_ACTOR_CATEGORIES);
    // 去掉姓名之间的空格后按顿号拆分多个角色，各自加内链后用顿号连接
    const charLinks = c.character
      .replace(/\s+/g, '')
      .split('、')
      .map((ch) => `[[${ch}]]`).join('、');
    return `* ${charLinks}：${vaLink}`;
  });

  // 角色名缺失的声优汇总到末行“其他”
  const others = cast.filter((c) => !c.character);
  if (others.length > 0) {
    const vaLinks = others
      .map((c) => resolveInternalLink(c.actor, pageInfoMap, VALID_VOICE_ACTOR_CATEGORIES))
      .join('、');
    lines.push(`* 其他：${vaLinks}`);
  }

  return ['== CAST ==', ...lines].join('\n');
};

/**
 * 生成 STAFF 章节 wikitext
 *
 * 从 staff 中过滤 shubetu IN (1,2,3,7)，按职种生成各行：
 * - 编剧(shubetu=2)、音乐(shubetu=3)：全部人员
 * - 原画(shubetu=1)：shubetuDetailName 非 SD原画
 * - SD原画(shubetu=1)：shubetuDetailName 为 SD原画
 * - 其他(shubetu=7)：仅 shubetuDetail=1（主要），按 shubetuDetailName 分组各行
 *
 * 人员内链按职种分类解析、别名写注释，同一职种多人用顿号连接。无 STAFF 数据时返回空字符串。
 */
const buildStaff = (detail: WorkDetail, pageInfoMap?: Map<string, PageInfo>): string => {
  const staff = detail.staff.filter((s) => ['1', '2', '3', '7'].includes(s.shubetu));
  if (staff.length === 0) {
    return '';
  }

  const lines = ['== STAFF =='];

  /** 生成某一职种人员列表行：`* 职种名：人员1、人员2` */
  const buildLine = (label: string, shubetu: string, persons: StaffRecord[]) => {
    if (persons.length === 0) { return; }
    const categories = STAFF_CATEGORY_MAP[shubetu] ?? [];
    const links = persons.map((p) => resolveInternalLink(parseStaffName(p.name).main, pageInfoMap, categories)).join('、');
    lines.push(`* ${label}：${links}`);
  };

  buildLine('编剧', '2', staff.filter((s) => s.shubetu === '2'));
  buildLine('原画', '1', staff.filter((s) => s.shubetu === '1' && s.shubetuDetailName !== 'SD原画'));
  buildLine('SD原画', '1', staff.filter((s) => s.shubetu === '1' && s.shubetuDetailName === 'SD原画'));
  buildLine('音乐', '3', staff.filter((s) => s.shubetu === '3'));

  // 其他职种：shubetu=7 且 shubetuDetail=1，按 shubetuDetailName 分组
  const others = staff.filter((s) => s.shubetu === '7' && s.shubetuDetail === '1' && s.shubetuDetailName);
  const otherGroups = groupBy(others, (s) => s.shubetuDetailName);
  for (const [label, persons] of Object.entries(otherGroups)) {
    buildLine(label, '7', persons);
  }

  // 仅标题无内容时返回空
  if (lines.length === 1) {
    return '';
  }
  return lines.join('\n');
};

/** 标准音乐分类到中文标签的映射；未命中时尝试 角色名+分类 格式解析 */
const MUSIC_CATEGORY_MAP: Record<string, string> = {
  OP: '片头曲',
  ED: '片尾曲',
  挿入歌: '插曲',
  キャラソン: '角色歌',
};

/** 音乐信息：SQL 解析的基础信息 + music.php 补充的创作者信息 */
interface MusicEntry {
  /** 分类展示标签 */
  categoryLabel: string;
  /** 曲名 */
  songName: string;
  /** 歌手列表（来自 SQL，同一首歌多个歌手合并） */
  singers: string[];
  /** music.php 补充的创作者；undefined=未尝试获取，null=尝试获取但失败 */
  creators?: MusicCreatorDetail | null;
}

/**
 * 从歌手记录的 shubetu_detail_name 解析分类标签与曲名
 *
 * - 标准分类（OP/ED/挿入歌/キャラソン）映射为中文标签
 * - 带 角色名+分类 前缀的解析为 <角色名><分类>
 * - 无「」时整体作为曲名，分类标签留空
 */
const parseMusicStaffName = (detailName: string) => {
  const match = detailName.match(/^(.+)「(.+)」$/);
  if (!match) {
    return { categoryLabel: '', songName: detailName };
  }
  const [_, rawCategory, songName] = match;
  // 去掉末尾“曲”后缀得到分类键
  const category = rawCategory!.replace(/曲$/, '');
  if (MUSIC_CATEGORY_MAP[category]) {
    return { categoryLabel: MUSIC_CATEGORY_MAP[category], songName: songName! };
  }
  // 带角色名前缀处理
  const prefixMatch = category.match(/^(.+?)(OP|ED|挿入歌|キャラソン)$/);
  if (prefixMatch) {
    const [, charName, type] = prefixMatch;
    return { categoryLabel: `${charName}${type}`, songName: songName! };
  }
  return { categoryLabel: category, songName: songName! };
};

/**
 * 从 STAFF 列表中提取音乐条目（shubetu=6）
 *
 * 每条歌手记录解析出分类与曲名，按曲名合并（同一首歌多个歌手聚为一项）。
 * 按 music.php 详情按曲名匹配补充创作者。
 * 分类来自 SQL 的 shubetu_detail_name
 */
const buildMusicEntries = (
  staff: StaffRecord[],
  creatorDetails: MusicCreatorDetail[] | undefined,
) => {
  const singers = staff.filter((s) => s.shubetu === '6');
  if (singers.length === 0) { return []; }
  // 按曲名合并：同一首歌的多个歌手聚为一条
  const bySong = new Map<string, MusicEntry>();
  for (const s of singers) {
    const { categoryLabel, songName } = parseMusicStaffName(s.shubetuDetailName);
    if (!bySong.has(songName)) {
      bySong.set(songName, { categoryLabel, songName, singers: [] });
    }
    bySong.get(songName)!.singers.push(s.name);
  }
  const entries = [...bySong.values()];
  if (!creatorDetails) { return entries; }
  // 按曲名匹配创作者详情，未匹配到时标记为 null（表示已尝试但失败）
  for (const entry of entries) {
    entry.creators = creatorDetails.find((d) => d.songName === entry.songName) ?? null;
  }
  return entries;
};

/** 将多个音乐相关人员名各自解析内链后用顿号连接 */
const joinMusicNames = (
  names: string[],
  pageInfoMap?: Map<string, PageInfo>,
) => names.map((n) => resolveInternalLink(parseStaffName(n).main, pageInfoMap, MUSIC_CATEGORIES)).join('、');

/** 生成相关音乐章节
 *
 * 有音乐记录时按分类分组，每曲生成 `* 分类《曲名》` + 演唱/作曲/编曲/作词子行；
 * 创作者名按萌百页面信息解析内链（作曲/作词/编曲用音乐人分类，歌手用歌手分类）。
 * 无音乐记录时返回空串，由调用方保留模板注释。
 */
const buildMusic = (entries: MusicEntry[], pageInfoMap?: Map<string, PageInfo>) => {
  if (entries.length === 0) {
    return '';
  }
  const lines: string[] = ['== 相关音乐 =='];

  // 按分类标签分组，保持原始顺序
  const byCategory = groupBy(entries, (e) => e.categoryLabel || '其他');

  for (const [label, items] of Object.entries(byCategory)) {
    for (const e of items) {
      lines.push(`* ${label}《${wrapLj(e.songName)}》`);
      // 演唱优先用 music.php 详情的歌手名，回退 SQL 的歌手名
      const singers = e.creators?.singer ?? e.singers;
      lines.push(`:演唱：${joinMusicNames(singers, pageInfoMap)}`);
      if (e.creators?.composer.length) {
        lines.push(`:作曲：${joinMusicNames(e.creators.composer, pageInfoMap)}`);
      }
      if (e.creators?.lyricist.length) {
        lines.push(`:作词：${joinMusicNames(e.creators.lyricist, pageInfoMap)}`);
      }
      if (e.creators?.arranger.length) {
        lines.push(`:编曲：${joinMusicNames(e.creators.arranger, pageInfoMap)}`);
      }
      // 创作者信息获取失败（已尝试 music.php 但未匹配到）时加注释提示
      if (!e.creators) {
        lines.push('<!-- 作曲、作词信息获取失败 -->');
      }
      lines.push('');
    }
  }

  return lines.join('\n');
};

/**
 * 生成注释及外部链接章节的外部链接行
 *
 * 按官网 → DLsite → twitter 顺序生成，各字段非空才输出对应行。
 * shoukai/twitter 直接取字段原值作 URL；DLsite 拼成完整 maniax 作品页 URL。
 * 全部为空时返回空数组
 */
const buildExternalLinks = (detail: WorkDetail): string[] => {
  const links: string[] = [];
  if (detail.shoukai) {
    links.push(`* [${detail.shoukai} 官方网站]`);
  }
  if (detail.dlsiteId) {
    // dlsite_domain 决定站点域段：成人作品为 maniax，全年龄为 home；空值默认 maniax
    const domain = detail.dlsiteDomain || 'maniax';
    links.push(`* [https://www.dlsite.com/${domain}/work/=/product_id/${detail.dlsiteId}.html DLsite作品页面]`);
  }
  if (detail.twitter) {
    links.push(`* [https://x.com/${detail.twitter} 作品X（原twitter）]`);
  }
  return links;
};

/**
 * 生成制作组织分类行（`[[分类:XX作品]]`）
 *
 * 仅取原作制作组织，使用解析后的规范标题
 */
const buildBrandCategories = (detail: WorkDetail, pageInfoMap?: Map<string, PageInfo>): string => {
  const title = resolveTitle(detail.brand, pageInfoMap, VALID_BRAND_CATEGORIES);
  return title ? `[[分类:${title}作品]]` : '';
};

/**
 * 生成平台分类行（多个 `[[分类:XX游戏]]` 同行空格分隔）
 *
 * 原作平台 + 移植版平台去重，仅收录萌百有对应分类的平台（platformCategory 非 null），
 * 未匹配的代码跳过。无任何可生成分类时返回空字符串。
 */
const buildPlatformCategories = (detail: WorkDetail): string => {
  const cats: string[] = [];
  const pushCat = (model: string) => {
    const name = platformCategory(model);
    if (name && !cats.includes(name)) { cats.push(name); }
  };
  pushCat(detail.model);
  for (const t of detail.transplants) { pushCat(t.model); }
  if (cats.length === 0) { return ''; }
  return cats.map((c) => `[[分类:${c}游戏]]`).join('');
};

/**
 * 生成作品条目完整wikitext
 *
 * 参考 cv-generator 的拼接方式，逐段 push 而非整体模板替换：
 * - infobox 段保留未涉及字段（image 等）的原注释
 * - 简介引言、CAST/STAFF 等后续章节各自成段，便于后续按章节扩展
 *
 * @param detail 作品详情（含移植/续作关联）
 * @param articleName 用户输入的条目名
 * @param pageInfoMap 制作组织页面信息映射（用于内链重定向解析）
 */
export function generateWorkWikitext(
  detail: WorkDetail,
  articleName: string,
  pageInfoMap?: Map<string, PageInfo>,
  musicCreatorDetails?: MusicCreatorDetail[],
): string {
  const sections: string[] = [];

  // 序言各移植版发行说明行，无有效移植版时为空字符串
  const publisherLines = buildPublisherLines(detail, pageInfoMap);
  // CAST 章节，无 CAST 数据时为空字符串
  const castText = buildCast(detail, pageInfoMap);
  // STAFF 章节，无 STAFF 数据时为空字符串
  const staffText = buildStaff(detail, pageInfoMap);
  // 相关音乐章节：从 shubetu=6 记录解析，按 music.php 详情补充创作者
  const musicEntries = buildMusicEntries(detail.staff, musicCreatorDetails);
  const musicText = buildMusic(musicEntries, pageInfoMap);
  // 外部链接章节行，无任何外链时为空数组
  const externalLinks = buildExternalLinks(detail);
  // 平台分类，无对应分类时为空字符串
  const platformCats = buildPlatformCategories(detail);
  // 制作组织分类，无制作组织时为空字符串
  const brandCats = buildBrandCategories(detail, pageInfoMap);

  // 页顶说明与欢迎编辑
  sections.push(
    '<!-- 编辑前可以参照其他类似条目作参考，完成后请将所有在“<! --  -- >”的文字删去，包括符号和这句话，你可以通过【显示预览】观看编辑的排版效果。 -->',
    '<!-- 这个模板较为复杂，如果你无法弄清楚各个项目的作用，可以先阅读[[Help:视觉小说专题编辑指南/作品条目编辑指南]]”。 -->',
    '{{欢迎编辑}}<!-- 此模板可以更换为作品或制作组织的系列页顶 -->',
  );

  // infobox
  sections.push(buildInfobox(detail, articleName, pageInfoMap));

  // infobox 后说明与引言模板
  sections.push(
    '<!-- 上面模板中不使用的项目，编辑说明中注明“删去”的可以删掉，其余项目留空即可。 -->',
    '{{Cquote|<!-- 此处填入官网首页的引言，添加与否视需要而定，不需要则删除此行。 -->}}',
    '',
  );

  // 一句话介绍
  // 仅 gamename 含日文字符（假名）时才追加 {{lang-ja}}；若条目名与日文名相同则括号冗余，一并省略
  const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF]/.test(detail.gamename);
  const langJaPart = hasJapanese && articleName !== detail.gamename
    ? `（{{lang-ja|'''${detail.gamename}'''}}）`
    : '';
  const titleArticleName = wrapLj(articleName);
  sections.push(
    `《'''${titleArticleName}'''》${langJaPart}是由${resolveInternalLink(detail.brand, pageInfoMap, VALID_BRAND_CATEGORIES)}制作发行的一款恋爱[[冒险游戏]]，于${formatSellDay(detail.sellday)}发售。`,
    // 序言：有移植版时生成各移植版发行说明，无移植版保留模板注释
    ...(publisherLines
      ? [publisherLines]
      : ['<!-- 如果作品有多个版本，则在一句话介绍的下方添加如下内容 -->', 'XX版由[[发行商]]代理，于XXXX年X月XX日发行。']),
  );

  // 简介及后续章节（保留模板注释，待后续填充）
  sections.push(
    '',
    '== 简介 ==',
    '<!-- 此处通常记录 官方 所介绍的剧情简介',
    '',
    '也可以另外介绍作品的其他相关内容，如作品的地位等。 -->',
    '',
    '<!-- 下方的 登场角色 和 CAST 选择其一进行介绍即可',
    '在填写声优信息时请严格按照{{R-18作品声优索引}}文档的规定设置链接。-->',
    '== 登场角色 ==',
    '<!-- 此处对作品的登场角色进行介绍，不需要请删去此章节。',
    '',
    '可以使用定义表、{{tabs}}、{{Main Characters Infolist}}等多种方式进行编写 -->',
    '',
    // CAST：有数据时生成，无数据保留模板注释
    ...(castText
      ? [castText]
      : [
        '== CAST ==',
        '<!-- 此处列举登场角色所对应的声优',
        '若角色较多建议使用{{columns-list}}分列显示',
        '若移植版或衍生作品有不同声优则使用斜杠，并注明：',
        '"声优如有不同，按PC/移植版排列。"-->',
      ]),
    '',
    // STAFF：有数据时生成，无数据保留模板注释
    ...(staffText
      ? [staffText]
      : [
        '== STAFF ==',
        '<!-- 此处列举作品的制作人员',
        '若制作人员较多建议使用{{columns-list}}分列显示-->',
      ]),
    '',
    // 相关音乐：有详情时生成，无详情保留模板注释
    ...(musicText ? [musicText] : [
      '== 相关音乐 ==',
      '* 片头曲：',
      ':演唱：',
      ':编曲：',
      ':作词：',
      '',
      '* 片尾曲：',
      ':演唱：',
      ':作曲：',
      ':作词：',
      '',
      '* 插曲：',
      ':演唱：',
      ':作曲：',
      ':作词：',
      '',
    ]),
    '== 衍生作品 ==',
    '<!-- 游戏的衍生作品，如动画、漫画、小说、广播剧等，视情况保留此章节 -->',
    '',
    '== 评价 ==',
    '<!-- 游戏在美少女游戏大赏或萌系游戏大赏等奖项的评选中获奖，可以在此处列举，不需要请删去此章节。 -->',
    '',
    '<!-- 最后：其他项目（章节目录、路线攻略、设定及用语、考据内容等）添加与否视需求而定。对于不需要的项目，请删除对应的章节标题。 -->',
    '<!-- 这里放大家族模板，可以是{{作品名}}或{{游戏制作组织名字}}，通常能在同类条目找到，作品大家族模板放置于制作组织模板之前。 -->',
    '<!-- 可以使用{{背景图片}}等模板对条目进行一定的美化。 -->',
    '',
    '== 注释及外部链接 ==',
    '<references />',
    ...(externalLinks.length > 0 ? externalLinks : ['<!-- 此处至少应写上官网链接。 -->']),
    '',
    '[[分类:日本游戏作品]]',
    // 平台分类：根据作品平台生成，无对应分类时保留注释占位
    ...(platformCats ? [platformCats] : ['<!-- 本行填写平台分类，按照游戏的平台填写，如[[分类:Windows游戏]]，有多少个平台作品就写什么平台的分类 -->']),
    // 制作组织分类根据制作组织生成，无时保留注释占位
    ...(brandCats ? [brandCats] : ['<!-- 本行填写制作组织分类，格式为[[分类:XX作品]] -->']),
    `[[分类:${articleName}|*]]`,
    '<!-- 本行填写类型分类，如[[分类:视觉小说]]、[[分类:恋爱冒险游戏]]等，按照[[Help:视觉小说专题编辑指南/作品条目编辑指南]]的说明进行填写 -->',
    '<!-- 本行填写题材分类，视觉小说常见的题材有[[分类:校园题材]]、[[分类:青春题材]]、[[分类:奇幻题材]]等，视作品内容填写 -->',
  );

  return sections.join('\n');
}
