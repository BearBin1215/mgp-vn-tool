import dayjs from 'dayjs';
import type { GameConnection, GameRecord } from '@/lib/types';
import type { PageInfo } from '@/stores/articleStore';
import { PENDING_SELL_DATE } from '@/utils/constants';
import { normalizePunctuation, wrapLj } from '@/utils/text';

/** 游戏关联映射，key 为 normalizePunctuation(subjectGameName) */
export type ConnectionsMap = Map<string, GameConnection[]>;

/** 根据关联列表构建按 subject 游戏名分组的映射 */
export function buildConnectionsMap(connections: GameConnection[]): ConnectionsMap {
  const map: ConnectionsMap = new Map();
  for (const c of connections) {
    const key = normalizePunctuation(c.subjectGameName);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(c);
  }
  return map;
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
export function generateCVWikitext(
  records: GameRecord[],
  gameMap: Map<string, string>,
  pageInfoMap?: Map<string, PageInfo>,
  connectionsMap?: ConnectionsMap,
) {
  if (records.length === 0) { return ''; }

  // 按发售日排序
  const sorted = [...records].sort((a, b) => a.sellDay.localeCompare(b.sellDay));

  /** 各年份出演作品表 */
  const yearGameMap = new Map<string, GameRecord[]>();
  const tbdRecords: GameRecord[] = [];
  for (const record of sorted) {
    // 批评空间上 2050-01-01 就是待定
    if (record.sellDay === PENDING_SELL_DATE) {
      tbdRecords.push(record);
      continue;
    }
    const year = record.sellDay.substring(0, 4);
    if (!yearGameMap.has(year)) {
      yearGameMap.set(year, []);
    }
    yearGameMap.get(year)!.push(record);
  }
  if (tbdRecords.length > 0) {
    yearGameMap.set('待定', tbdRecords);
  }

  const lines: string[] = [];

  const years = [...yearGameMap.keys()].sort();
  for (const year of years) {
    const yearRecords = yearGameMap.get(year)!;
    lines.push(`'''${year === '待定' ? '待定' : `${year}年`}'''`);

    // 同一年内按游戏名分组，同一游戏的多个角色用顿号分隔，多平台合并
    const byGame = new Map<string, GameRecord[]>();
    for (const r of yearRecords) {
      if (!byGame.has(r.gameName)) {
        byGame.set(r.gameName, []);
      }
      byGame.get(r.gameName)!.push(r);
    }

    for (const [gameName, chars] of byGame) {
      const gameDisplay = resolveGameDisplay(gameName, gameMap, connectionsMap, wrapLj);

      // 收集所有平台（去重），非 PC 平台显示括号注明平台
      const platforms = [...new Set(chars.map((c) => c.model?.trim()).filter(Boolean))];
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
