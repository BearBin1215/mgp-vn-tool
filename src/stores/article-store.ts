import { create } from 'zustand';
import dayjs from 'dayjs';
import { chunk } from 'es-toolkit';
import feishu from '@/api/feishu';
import moegirl, { fetchPageInfo, getMoegirlQueryBatchSize } from '@/api/moegirl';
import { ApiParams } from '@/lib/types';
import { createLocalizedError } from '@/utils/error';
import { extractBrand, extractJa, extractReleaseDate } from '@/utils/text';
import { loadConfigStore } from '@/lib/config-store';


/** 条目数据 */
export interface Article {
  /** 日文原名 */
  ja: string;
  /** 条目名 */
  title: string;
  /** 制作组织 */
  brand: string;
  /** 游戏发行时间 */
  releaseDate: string;
  /** 条目创建时间 */
  creationDate: string;
  /** 分类 */
  categories: string[];
  /** 重定向目标（有值时表示该条目被重定向） */
  redirect?: string;
  /** 重定向到该条目的页面列表 */
  redirects?: string[];
}

/** 检查更新筛出的待入库候选条目 */
export interface UpdateCandidate {
  /** 日文原名（优先从条目源代码提取，提取不到时留空由用户补充） */
  ja: string;
  /** 条目名（当前规范标题） */
  title: string;
  /** 制作组织（优先从条目源代码提取，提取不到时留空由用户补充） */
  brand: string;
  /** 游戏发行时间（优先从条目源代码提取，格式 YYYY-MM-DD） */
  releaseDate: string;
  /** 条目创建时间（来自萌百日志，格式 YYYY-MM-DD） */
  creationDate: string;
  /** 页面分类（已去除冗余分类） */
  categories: string[];
}

/** 条目数据 store */
interface ArticleStore {
  /** 条目列表 */
  articles: Article[];
  /** 最近更新时间 */
  updatedAt: string;
  /** 本次会话是否已弹出过更新提醒 */
  hasShownUpdateReminder: boolean;
  /** 是否正在加载 */
  loading: boolean;
  /** 检查更新得到的候选条目 */
  candidates: UpdateCandidate[];
  /** 是否正在检查更新 */
  checking: boolean;
  /** 从飞书表格获取条目数据并存储 */
  fetchFeishuTable: (appId: string, appSecret: string) => Promise<void>;
  /** 从萌百获取分类和重定向数据 */
  fetchPageData: () => Promise<void>;
  /** 检查更新：同步表格后经萌百增量检测候选条目，返回候选数量 */
  checkUpdates: (appId: string, appSecret: string) => Promise<number>;
  /** 清空检查更新的候选条目 */
  clearCandidates: () => void;
}

/** Tauri store 实例（路径由后端统一解析到用户配置目录） */
const storePromise = loadConfigStore('articles.json');

/** 将 Excel 序列日期转为 YYYY-MM-DD 字符串 */
const excelDateToString = (value: string): string => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) { return value; }
  const d = dayjs((num - 25569) * 86400000);
  return d.isValid() ? d.format('YYYY-MM-DD') : value;
};

/** 从飞书表格行数据解析为 Article（分类待后续填充） */
const parseRow = (row: string[]): Article => {
  const ja = (row[0] || '').trim();
  const title = (row[1] || '').trim() || ja;
  return {
    ja,
    title,
    brand: (row[2] || '').trim(),
    categories: [],
    releaseDate: excelDateToString((row[3] || '').trim()),
    creationDate: excelDateToString((row[4] || '').trim()),
  };
};

interface PageData {
  title: string;
  /** 页面所属分类 */
  categories?: { title: string }[];
  /** 页面重定向 */
  redirects?: { title: string }[];
}

/** 过滤掉每个条目都有的 Category:日本游戏作品、Category:XXXX作品、Category:PAGENAME */
const isExcludedCategory = (category: string, articleTitle: string): boolean => {
  if (category === '日本游戏作品' || category.endsWith('作品')) { return true; }
  // 去掉消歧义后缀（如 '雫(Leaf)' → '雫'）再比较
  const baseTitle = articleTitle.replace(/\(.*?\)$/, '').trim();
  return category === baseTitle;
};

/** 候选条目必须命中的游戏类型分类 */
const TARGET_CATEGORIES = ['视觉小说', '恋爱冒险游戏', '冒险游戏', '文字冒险游戏'];

interface FetchPageDataResult {
  categories: Map<string, string[]>;
  redirects: Map<string, string>;
  pageRedirects: Map<string, string[]>;
}

/** 从萌娘百科批量获取条目分类和重定向，串行请求以避免多并发出错 */
const fetchPageData = async (titles: string[]): Promise<FetchPageDataResult> => {
  /** 分类映射：标题 -> 分类 */
  const categories = new Map<string, string[]>();
  /** 重定向映射：原始标题 -> 重定向后的标题 */
  const redirects = new Map<string, string>();
  /** 页面重定向映射：标题 -> 指向该页面的重定向标题列表 */
  const pageRedirects = new Map<string, string[]>();
  const batchSize = getMoegirlQueryBatchSize();

  for (const batch of chunk(titles, batchSize)) {
    let continueParams: ApiParams = {};
    let hasMore = true;
    do {
      const params: ApiParams = {
        action: 'query',
        format: 'json',
        prop: ['redirects', 'categories'],
        titles: batch,
        redirects: '1',
        rdprop: 'title',
        rdlimit: 'max',
        cllimit: 'max',
        clshow: '!hidden',
        ...continueParams,
      };

      const res = await moegirl.post(params);
      const query = (res as { query?: { pages?: PageData[]; redirects?: { from: string; to: string }[] } }).query || {};
      const pages = query.pages || [];
      const batchRedirects = query.redirects || [];

      for (const r of batchRedirects) {
        redirects.set(r.from, r.to);
      }

      for (const page of pages) {
        // 处理分类
        if (page.categories) {
          const cats = page.categories
            .map((c) => c.title.replace(/^Category:/, ''))
            .filter((c) => !isExcludedCategory(c, page.title));
          categories.set(page.title, cats);
          // 将分类也赋给被重定向的原始标题
          for (const [from, to] of redirects) {
            if (to === page.title) {
              categories.set(from, cats);
            }
          }
        }

        // 处理重指向该页面的重定向
        if (page.redirects) {
          const redirectTitles = page.redirects.map((r) => r.title);
          pageRedirects.set(page.title, redirectTitles);
          // 将重定向也复制给被重定向的原始标题
          for (const [from, to] of redirects) {
            if (to === page.title && !pageRedirects.has(from)) {
              pageRedirects.set(from, redirectTitles);
            }
          }
        }
      }

      // 处理 continue，可能同时有 clcontinue 和 rdcontinue
      const cont = (res as { continue?: Record<string, string> }).continue;
      if (cont && (cont.clcontinue || cont.rdcontinue || cont.continue)) {
        continueParams = {};
        if (cont.clcontinue) { continueParams.clcontinue = cont.clcontinue; }
        if (cont.rdcontinue) { continueParams.rdcontinue = cont.rdcontinue; }
        if (cont.continue) { continueParams.continue = cont.continue; }
      } else {
        hasMore = false;
      }
    } while (hasMore);
  }

  return { categories, redirects, pageRedirects };
};

/** logevents 接口的单条日志 */
interface LogEvent {
  /** 日志 ID，用于同一秒内事件排序 */
  logid?: number;
  /** 页面标题 */
  title: string;
  /** 日志类型 */
  type?: string;
  /** 时间戳（ISO 8601） */
  timestamp: string;
  /** 日志详情（move 类型时含移动目标） */
  params?: {
    /** 目标命名空间 */
    target_ns?: number;
    /** 移动目标标题 */
    target_title?: string;
    /** 是否未保留重定向 */
    suppressredirect?: boolean;
  };
}

/** logevents 接口的响应结构 */
interface LogEventsResponse {
  query?: { logevents?: LogEvent[] };
  continue?: Record<string, string>;
}

/** prop=revisions 内容查询的响应结构 */
interface RevisionContentResponse {
  query?: {
    pages?: Array<{
      title: string;
      revisions?: Array<{ slots?: { main?: { content?: string } } }>;
    }>;
  };
}

/**
 * 抓取指定时间段内主命名空间的全部指定类型日志事件
 *
 * logevents 默认从新到旧枚举，因此传参为 lestart=较晚终点、leend=较早起点，
 * 与直觉方向相反，调用时注意
 * @param eventType 日志类型（create/move）
 * @param startISO 较早的时间下界（含）
 * @param endISO 较晚的时间上界（含）
 */
const fetchLogEvents = async (
  eventType: string,
  startISO: string,
  endISO: string,
): Promise<LogEvent[]> => {
  const events: LogEvent[] = [];
  let continueParams: ApiParams = {};
  let hasMore = true;

  do {
    const params: ApiParams = {
      action: 'query',
      list: 'logevents',
      letype: eventType,
      lenamespace: 0,
      lestart: endISO,
      leend: startISO,
      leprop: ['ids', 'title', 'timestamp', 'details'],
      lelimit: 'max',
      ...continueParams,
    };

    const res = await moegirl.post(params);
    events.push(...(((res as LogEventsResponse).query?.logevents) || []));

    const cont = (res as LogEventsResponse).continue;
    if (cont && (cont.lecontinue || cont.continue)) {
      continueParams = {};
      if (cont.lecontinue) { continueParams.lecontinue = cont.lecontinue; }
      if (cont.continue) { continueParams.continue = cont.continue; }
    } else {
      hasMore = false;
    }
  } while (hasMore);

  return events;
};

/**
 * 将创建事件的标题沿其发生之后的移动事件收敛为当前标题。
 * 只应用创建时间之后的移动，避免旧标题被重建后误套用历史移动映射。
 * @param title 创建时的标题
 * @param createdEvent 创建事件
 * @param moveEvents 按时间升序排列的移动事件
 */
const resolveMovedTitle = (
  title: string,
  createdEvent: LogEvent,
  moveEvents: LogEvent[],
): string => {
  const seen = new Set<string>();
  let current = title;
  for (const event of moveEvents) {
    const isAfterCreation = event.timestamp > createdEvent.timestamp
      || (event.timestamp === createdEvent.timestamp
        && event.logid !== undefined
        && createdEvent.logid !== undefined
        && event.logid > createdEvent.logid);
    if (!isAfterCreation || event.title !== current || !event.params?.target_title) {
      continue;
    }
    if (seen.has(current)) {
      break;
    }
    seen.add(current);
    current = event.params.target_title;
  }
  return current;
};

/**
 * 批量获取页面 wikitext 源代码，串行请求以避免多并发出错
 * @param titles 页面标题列表
 * @returns 标题到源代码的映射（缺失或已删除的页面不在结果中）
 */
const fetchPageWikitexts = async (titles: string[]): Promise<Map<string, string>> => {
  const result = new Map<string, string>();
  const batchSize = getMoegirlQueryBatchSize();

  for (const batch of chunk(titles, batchSize)) {
    const res = await moegirl.post({
      action: 'query',
      prop: 'revisions',
      rvprop: ['content'],
      rvslots: 'main',
      titles: batch,
    });
    const pages = ((res as RevisionContentResponse).query?.pages) || [];
    for (const page of pages) {
      const content = page.revisions?.[0]?.slots?.main?.content;
      if (content) {
        result.set(page.title, content);
      }
    }
  }

  return result;
};

/** 条目统计 store，持久化到 Tauri store */
export const useArticleStore = create<ArticleStore>((set, get) => ({
  articles: [],
  updatedAt: '',
  hasShownUpdateReminder: false,
  loading: false,
  candidates: [],
  checking: false,

  /** 从飞书表格获取条目数据 */
  fetchFeishuTable: async (appId, appSecret) => {
    set({ loading: true });
    try {
      const rows = await feishu.fetchSheet(appId, appSecret);
      const articles = rows.filter((row) => row[0]).map(parseRow);
      const updatedAt = dayjs().format('YYYY-MM-DD HH:mm');

      // 更新存储
      const store = await storePromise;
      await store.set('articles', articles);
      await store.set('updatedAt', updatedAt);
      await store.save();

      set({ articles, updatedAt, loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  /** 从萌百获取分类和重定向数据 */
  fetchPageData: async () => {
    const { articles } = get();
    if (articles.length === 0) { return; }
    set({ loading: true });
    try {
      const titles = articles.map((a) => a.title);
      const { categories: categoryMap, redirects: redirectMap, pageRedirects } = await fetchPageData(titles);
      const updated = articles.map((a) => {
        const apiCats = categoryMap.get(a.title) || [];
        const redirect = redirectMap.get(a.title);
        const redirects = pageRedirects.get(a.title);
        return {
          ...a,
          categories: [...new Set([...a.categories, ...apiCats])],
          ...(redirect ? { redirect } : {}),
          ...(redirects && redirects.length > 0 ? { redirects } : {}),
        };
      });

      // 更新存储
      const store = await storePromise;
      await store.set('articles', updated);
      await store.save();

      set({ articles: updated, loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  /** 检查更新：同步表格后经萌百增量检测候选条目，返回候选数量 */
  checkUpdates: async (appId, appSecret) => {
    set({ checking: true, candidates: [] });
    try {
      // 先全量重拉表格，保证增量起点与去重依据均为最新数据
      await get().fetchFeishuTable(appId, appSecret);
      const { articles } = get();
      // 以表格 E 列（条目创建时间）的最大值作为增量起点
      const latestCreationDate = articles.reduce(
        (max, a) => (a.creationDate > max ? a.creationDate : max),
        '',
      );
      if (!latestCreationDate || !dayjs(latestCreationDate).isValid()) {
        throw createLocalizedError(
          'article_creation_date_baseline_missing',
          '表格中没有可用的创建时间基准，无法确定增量起点',
        );
      }

      // E 列仅有日期精度，起点取该日零点；终点为当前时间
      const startISO = `${latestCreationDate}T00:00:00Z`;
      const endISO = new Date().toISOString();

      // create 与 move 分两次抓取（letype 为单值参数），串行请求避免多并发出错
      const createdEvents = await fetchLogEvents('create', startISO, endISO);
      const moveEvents = await fetchLogEvents('move', startISO, endISO);

      // 按时间升序处理移动，解析创建事件时只应用其后的移动。
      const sortedMoveEvents = moveEvents
        .filter((event) => Boolean(event.params?.target_title) && event.params?.target_ns === 0)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp)
          || (a.logid ?? 0) - (b.logid ?? 0));

      /** 当前标题到最早创建时间的映射（多个旧标题可能收敛到同一标题） */
      const currentToCreatedAt = new Map<string, string>();
      for (const event of createdEvents) {
        const currentTitle = resolveMovedTitle(event.title, event, sortedMoveEvents);
        const existing = currentToCreatedAt.get(currentTitle);
        if (!existing || event.timestamp < existing) {
          currentToCreatedAt.set(currentTitle, event.timestamp);
        }
      }

      if (currentToCreatedAt.size === 0) {
        set({ candidates: [], checking: false });
        return 0;
      }

      const infos = await fetchPageInfo([...currentToCreatedAt.keys()]);

      /** 已收录条目的标题集合，用于排除重复 */
      const existingKeys = new Set(
        articles.flatMap((a) => [a.ja, a.title]).filter(Boolean).map((k) => k.toLowerCase()),
      );

      const candidates: UpdateCandidate[] = [];
      for (const [currentTitle, createdAt] of currentToCreatedAt) {
        const info = infos.get(currentTitle);
        if (!info) { continue; }
        // 已删除或消歧义页不作为候选
        if (info.pageId === null || info.isDisambiguation) { continue; }
        // 分类需同时命中「日本游戏作品」与任一目标游戏类型
        if (!info.categories.includes('日本游戏作品')) { continue; }
        if (!TARGET_CATEGORIES.some((c) => info.categories.includes(c))) { continue; }
        // 本体或重定向目标已在表格中时跳过，防止重复入库
        const keys = [currentTitle, info.title, info.redirectTo ?? '']
          .filter(Boolean)
          .map((k) => k.toLowerCase());
        if (keys.some((k) => existingKeys.has(k))) { continue; }

        candidates.push({
          ja: '',
          title: info.title,
          brand: '',
          releaseDate: '',
          creationDate: dayjs(createdAt).format('YYYY-MM-DD'),
          categories: info.categories.filter((c) => !isExcludedCategory(c, info.title)),
        });
      }

      // 从条目源代码中预填发行时间、原名与制作组织
      if (candidates.length > 0) {
        const wikitexts = await fetchPageWikitexts(candidates.map((c) => c.title));
        for (const candidate of candidates) {
          const wikitext = wikitexts.get(candidate.title) ?? '';
          candidate.releaseDate = extractReleaseDate(wikitext);
          candidate.ja = extractJa(wikitext);
          candidate.brand = extractBrand(wikitext);
        }
      }

      // 与写入表格的顺序一致，按创建时间升序展示
      candidates.sort((a, b) => a.creationDate.localeCompare(b.creationDate));
      set({ candidates, checking: false });
      return candidates.length;
    } catch (err) {
      set({ checking: false });
      throw err;
    }
  },

  /** 清空检查更新的候选条目 */
  clearCandidates: () => set({ candidates: [] }),
}));

/** 从 Tauri store 加载条目数据并更新 store */
export const initArticles = async () => {
  const store = await storePromise;
  const articles = (await store.get<Article[]>('articles')) || [];
  const updatedAt = (await store.get<string>('updatedAt')) || '';
  useArticleStore.setState({ articles, updatedAt });
};
