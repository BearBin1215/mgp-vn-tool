import dayjs from 'dayjs';
import { groupBy, uniq } from 'lodash-es';
import type { CreatorWorksResult, GameConnection, GameRecord } from '@/api/erogamescape';
import type { PageInfo } from '@/api/moegirl';
import { PENDING_SELL_DATE } from '@/utils/constants';
import { buildJapaneseNameTemplate, generateExternalLinksWikitext, normalizePunctuation, wrapLj } from '@/utils/text';

/** 游戏关联映射，key 为 normalizePunctuation(subjectGameName) */
export type ConnectionsMap = Map<string, GameConnection[]>;

/** 根据关联列表构建按 subject 游戏名分组的映射 */
export function buildConnectionsMap(connections: GameConnection[]): ConnectionsMap {
  const grouped = groupBy(connections, (c) => normalizePunctuation(c.subjectGameName));
  return new Map(Object.entries(grouped));
}

/**
 * 解析单个游戏的显示文本
 *
 * 优先级：
 * 1. 自身有萌百条目 → `[[条目]]`
 * 2. 无自身条目但与某原作存在 FD/追加篇/重制版 关联，且原作有萌百条目 → `[[原作条目|显示名]]`
 * 3. 否则 → 显示名（由 formatDisplayName 决定是否包装）
 *
 * @param gameName 原始游戏名
 * @param gameMap 萌百条目映射（normalizePunctuation 游戏名 → 条目标题）
 * @param connectionsMap 关联映射
 * @param formatDisplayName 显示名格式化函数（CV 表用 wrapLj，音乐表用 normalizePunctuation）
 */
function resolveGameDisplay(
  gameName: string,
  gameMap: Map<string, string>,
  connectionsMap: ConnectionsMap | undefined,
  formatDisplayName: (name: string) => string,
): string {
  const normalized = normalizePunctuation(gameName);
  const selfArticle = gameMap.get(normalized);
  if (selfArticle) {
    return `[[${selfArticle}]]`;
  }

  if (connectionsMap) {
    const conns = connectionsMap.get(normalized);
    if (conns) {
      for (const c of conns) {
        const objectArticle = gameMap.get(normalizePunctuation(c.objectGameName));
        if (objectArticle) {
          return `[[${objectArticle}|${formatDisplayName(gameName)}]]`;
        }
      }
    }
  }

  return formatDisplayName(gameName);
}

/**
 * 根据音乐作品生成 wikitable
 *
 * 游戏名通过 gameMap 尝试内链到已有条目，无自身条目时尝试 Fan Disk/追加篇/重制版 管道内链。
 */
export function generateMusicWikitable(
  records: GameRecord[],
  gameMap: Map<string, string>,
  connectionsMap?: ConnectionsMap,
) {
  if (records.length === 0) {
    return '';
  }

  const sorted = [...records].sort((a, b) => a.sellDay.localeCompare(b.sellDay));

  const lines: string[] = [];
  lines.push(
    '{| class="wikitable"',
    '|-',
    '! 标题 !! 时间 !! 备注',
  );

  for (const r of sorted) {
    const songName = wrapLj(r.shubetuDetailName);
    const date = r.sellDay !== PENDING_SELL_DATE ? dayjs(r.sellDay, 'YYYY-MM-DD', true).format('YYYY年M月D日') : '待定';
    const gameDisplay = resolveGameDisplay(r.gameName, gameMap, connectionsMap, normalizePunctuation);
    lines.push('|-', `| ${songName} || ${date} || 《${gameDisplay}》`);
  }

  lines.push('|}');
  return lines.join('\n');
}

/**
 * 根据出演记录生成 wikitext
 *
 * 作品名通过 gameMap 查询条目统计添加内链，角色名通过 pageInfoMap 查询萌百页面信息添加内链
 */
export function buildActingWikitext(
  records: GameRecord[],
  gameMap: Map<string, string>,
  pageInfoMap?: Map<string, PageInfo>,
  connectionsMap?: ConnectionsMap,
) {
  if (records.length === 0) { return ''; }

  // 按发售日排序
  const sorted = [...records].sort((a, b) => a.sellDay.localeCompare(b.sellDay));

  /** 各年份出演作品表：先分离待定记录，再按年份分组 */
  const tbdRecords = sorted.filter((r) => r.sellDay === PENDING_SELL_DATE);
  const yearGameMap = new Map(
    Object.entries(groupBy(
      sorted.filter((r) => r.sellDay !== PENDING_SELL_DATE),
      (r) => r.sellDay.substring(0, 4),
    )),
  );
  if (tbdRecords.length > 0) {
    yearGameMap.set('待定', tbdRecords);
  }

  const lines: string[] = [];

  const years = [...yearGameMap.keys()].sort();
  for (const year of years) {
    const yearRecords = yearGameMap.get(year)!;
    lines.push(`'''${year === '待定' ? '待定' : `${year}年`}'''`);

    // 同一年内按游戏名分组，同一游戏的多个角色用顿号分隔，多平台合并
    const byGame = groupBy(yearRecords, (r) => r.gameName);

    for (const [gameName, chars] of Object.entries(byGame)) {
      const gameDisplay = resolveGameDisplay(gameName, gameMap, connectionsMap, wrapLj);

      // 收集所有平台（去重），非 PC 平台显示括号注明平台
      const platforms = uniq(chars.map((c) => c.model).filter(Boolean));
      const notPCPlatforms = platforms.filter((p) => p !== 'Windows' && p !== 'PC');
      const platformTag = notPCPlatforms.length > 0 ? `（${notPCPlatforms.join('、')}）` : '';

      // 展开并去重角色（同一记录可能含多个用顿号分隔的角色）
      const allChars = chars.flatMap((c) => {
        const raw = c.shubetuDetailName.replace(/\s+/g, ''); // 去掉空格
        if (!raw) {
          return [];
        }
        return raw.split('、').filter(Boolean).map((name, idx) => ({
          name,
          /** 主要角色加粗，标记为主要并且配音多个角色时只给第一个加粗 */
          bold: c.shubetuDetail === '1' && idx === 0,
        }));
      });
      const seen = new Set<string>();
      /** 出演的角色中是否有站内链接是消歧义页 */
      let hasDisambiguation = false;
      const charParts = allChars.filter((c) => {
        if (seen.has(c.name)) {
          return false;
        }
        seen.add(c.name);
        return true;
      }).map((c) => {
        if (!pageInfoMap) {
          const displayName = wrapLj(c.name);
          return c.bold ? `'''${displayName}'''` : displayName;
        }
        const info = pageInfoMap.get(c.name);
        if (!info) {
          const displayName = wrapLj(c.name);
          return c.bold ? `'''${displayName}'''` : displayName;
        }
        if (info.isDisambiguation) {
          hasDisambiguation = true;
          return c.bold ? `'''${c.name}'''` : c.name;
        }
        if (info.pageId !== null) {
          // 判断是否属于角色相关分类（XX角色、XX姓、XX瞳、XX发）
          const isCharacterPage = info.categories.some((cat) =>
            /(?:角色|姓|瞳|发)$/.test(cat),
          );
          if (isCharacterPage) {
            return c.bold ? `'''[[${info.title}]]'''` : `[[${info.title}]]`;
          }
          const displayName = wrapLj(c.name);
          return c.bold ? `'''${displayName}'''` : displayName;
        }
        const displayName = wrapLj(c.name);
        return c.bold ? `'''${displayName}'''` : displayName;
      });

      const charStr = charParts.length > 0 ? charParts.join('、') : '';
      const hasMixed = charParts.some((c) => c.startsWith("'''")) && charParts.some((c) => !c.startsWith("'''"));
      const notes: string[] = [];
      if (hasMixed) {
        // 同一游戏的角色列表中既有加粗（主要）也有不加粗（次要）的，提示人工确认
        notes.push('<!-- 第二个角色是否为主要角色可能需要手动确认 -->');
      }
      if (hasDisambiguation) {
        // 角色名称对应的页面是消歧义页，加注释标记
        notes.push('<!-- 角色名链接是消歧义页 -->');
      }
      const noteStr = notes.length > 0 ? notes.join('') : '';
      lines.push(`* ${charStr}————《${gameDisplay}》${platformTag}${noteStr}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 组装声优条目完整 wikitext
 *
 * 声优信息模板 + 引言 + 出演作品 + 音乐作品 + 注释及外部链接。
 * pageInfoMap 缺省时角色名不加内链（渐进生成的中间结果），传入后角色名按萌百页面信息加内链。
 * @param result 批评空间创作者作品查询结果
 * @param gameArticleMap 萌百条目映射（normalizePunctuation 游戏名 → 条目标题），用于游戏名内链
 * @param pageInfoMap 角色名页面信息映射，缺省时角色名无内链
 */
export function generateCVWikitext(
  result: CreatorWorksResult,
  gameArticleMap: Map<string, string>,
  pageInfoMap?: Map<string, PageInfo>,
): string {
  const sections: string[] = [];

  // 欢迎编辑模板
  sections.push('{{欢迎编辑}}');

  // 长期关注及更新模板：最近2年内>3部作品 且 最近1年内>=1部作品
  const allRecords = [...result.acting, ...result.music];
  const currentYear = dayjs().year();
  const countRecentWorks = (yearsAgo: number) =>
    allRecords.filter((r) => {
      if (!r.sellDay || r.sellDay === PENDING_SELL_DATE) { return false; }
      return dayjs(r.sellDay, 'YYYY-MM-DD', true).year() >= currentYear - yearsAgo;
    }).length;
  if (countRecentWorks(2) > 3 && countRecentWorks(1) >= 1) {
    sections.push('{{长期关注及更新}}');
  }

  const { creatorInfo } = result;
  const connectionsMap = buildConnectionsMap(result.gameConnections);
  const nameWithFurigana = creatorInfo.furigana
    ? buildJapaneseNameTemplate(creatorInfo.name, creatorInfo.furigana)
    : creatorInfo.name;
  sections.push(
    '{{声优信息',
    `|姓名=${nameWithFurigana}`,
    '|image=',
    '|图片信息=',
    '|其它艺名=',
    '|昵称=',
    '|性别=女',
    '|国籍=日本',
    '|配演语言=日语',
    '|出身地区=',
    '|所属公司=',
    '|出道角色=',
    '|代表角色=',
    '|本体=',
    '}}',
    `'''${creatorInfo.name}'''是日本的女性声优，多从事[[成人游戏]]的配音工作。`,
    '',
    '== 出演作品 ==',
    "主要角色以'''粗体'''显示。",
    '',
    '=== 游戏 ===',
    buildActingWikitext(result.acting, gameArticleMap, pageInfoMap, connectionsMap),
  );

  const musicText = generateMusicWikitable(result.music, gameArticleMap, connectionsMap);
  if (musicText) {
    sections.push('== 音乐作品 ==', musicText);
  }

  // 注释及外部链接
  const externalLinks = generateExternalLinksWikitext(creatorInfo);
  sections.push(
    '',
    '{{R-18作品声优索引|女}}',
    '',
    '== 注释及外部链接 ==',
    '<references />',
  );
  if (externalLinks) {
    sections.push(externalLinks);
  }

  return sections.join('\n');
}
