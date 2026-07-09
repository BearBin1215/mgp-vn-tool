import { create } from 'zustand';
import dayjs from 'dayjs';
import feishu from '@/api/feishu';
import moegirl from '@/api/moegirl';
import { ApiParams } from '@/lib/types';
import { loadConfigStore } from '@/lib/config-store';
import { useMoegirlStore } from './moegirl-store';


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
  /** 从飞书表格获取条目数据并存储 */
  fetchFeishuTable: (appId: string, appSecret: string) => Promise<void>;
  /** 从萌百获取分类和重定向数据 */
  fetchPageData: () => Promise<void>;
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
  /** 根据用户权限调整批量大小 */
  const BATCH_SIZE = useMoegirlStore.getState().rights.includes('apihighlimits') ? 500 : 50;

  for (let i = 0; i < titles.length; i += BATCH_SIZE) {
    const batch = titles.slice(i, i + BATCH_SIZE);

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

/** 条目统计 store，持久化到 Tauri store */
export const useArticleStore = create<ArticleStore>((set, get) => ({
  articles: [],
  updatedAt: '',
  hasShownUpdateReminder: false,
  loading: false,

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
}));

/** 从 Tauri store 加载条目数据并更新 store */
export const initArticles = async () => {
  const store = await storePromise;
  const articles = (await store.get<Article[]>('articles')) || [];
  const updatedAt = (await store.get<string>('updatedAt')) || '';
  useArticleStore.setState({ articles, updatedAt });
};
