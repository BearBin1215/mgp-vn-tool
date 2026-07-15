import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '@/stores/settings-store';
import { useMoegirlStore } from '@/stores/moegirl-store';
import type { ApiParams } from '@/lib/types';

interface TokenQueryResponse {
  query?: {
    tokens?: Record<string, string>;
  };
}

/** getUserRights 返回的当前用户信息 */
export interface UserInfo {
  /** 用户组 */
  groups: string[];
  /** 用户权限 */
  rights: string[];
  /** 显示昵称（未设置时为 null） */
  displayname: string | null;
  /** 昵称标签（未设置时为 null） */
  displaytag: string | null;
}

/** list=users 接口的响应结构 */
interface UsersQueryResponse {
  query?: {
    users?: Array<{
      groups?: string[];
      rights?: string[];
      displayname?: string | null;
      displaytag?: string | null;
    }>;
  };
}

/** 本次会话中使用过的 token，减少重复获取 */
const tokenCache = new Map<string, string>();

const moegirl = {
  get(params: ApiParams) {
    const { moegirlApiHost: host, moegirlUserAgent: userAgent } = useSettingsStore.getState();
    return invoke<Record<string, unknown>>('moegirl_request', {
      host,
      method: 'GET',
      params,
      userAgent,
    });
  },

  post(params: ApiParams) {
    const { moegirlApiHost: host, moegirlUserAgent: userAgent } = useSettingsStore.getState();
    return invoke<Record<string, unknown>>('moegirl_request', {
      host,
      method: 'POST',
      params,
      userAgent,
    });
  },

  /** 获取指定类型的 token，优先使用缓存 */
  async getToken(tokenType: string): Promise<string> {
    const cached = tokenCache.get(tokenType);
    if (cached) {
      return cached;
    }
    try {
      const res = await moegirl.post({
        action: 'query',
        meta: 'tokens',
        type: tokenType,
      });
      const tokens = (res as TokenQueryResponse).query?.tokens;
      const token = tokens?.[`${tokenType}token`];
      if (!token) {
        throw new Error(`获取 ${tokenType} Token 失败`);
      }
      tokenCache.set(tokenType, token);
      return token;
    } catch (e) {
      // 失败时清缓存，避免后续复用可能无效的 token（如权限变更）
      tokenCache.delete(tokenType);
      throw e;
    }
  },

  /** 先获取 token，再携带 token 发起 POST 请求 */
  async postWithToken(tokenType: string, params: ApiParams): Promise<Record<string, unknown>> {
    const token = await moegirl.getToken(tokenType);
    const tokenField = tokenType === 'login' ? 'logintoken' : 'token';
    return moegirl.post({ ...params, [tokenField]: token });
  },

  /** 检查登录状态 */
  checkLogin(): Promise<string | null> {
    return invoke<string | null>('moegirl_check_login');
  },

  /** 获取当前用户的 groups、rights 以及显示昵称 */
  async getUserRights(): Promise<UserInfo> {
    const username = useSettingsStore.getState().moegirlUsername;
    const res = await moegirl.post({
      action: 'query',
      list: 'users',
      ususers: username,
      usprop: ['groups', 'rights'],
    });
    const user = (res as UsersQueryResponse).query?.users?.[0];
    return {
      groups: user?.groups || [],
      rights: user?.rights || [],
      displayname: user?.displayname ?? null,
      displaytag: user?.displaytag ?? null,
    };
  },

  /** 退出登录，清空 token 缓存 */
  logout(): Promise<void> {
    tokenCache.clear();
    return invoke<void>('moegirl_logout');
  },
};

export interface PageInfo {
  pageId: number | null;
  title: string;
  isDisambiguation: boolean;
  /** 页面所属分类列表（已去除 Category: 前缀） */
  categories: string[];
  convertedFrom?: string;
  redirectTo?: string;
}

/** 批量查询页面信息，返回标题到 PageInfo 的映射 */
export const fetchPageInfo = async (titles: string[]): Promise<Map<string, PageInfo>> => {
  const result = new Map<string, PageInfo>();
  const convertedMap = new Map<string, string>();
  const redirectMap = new Map<string, string>();
  /** 根据用户权限调整批量大小 */
  const BATCH_SIZE = useMoegirlStore.getState().rights.includes('apihighlimits') ? 500 : 50;

  for (let i = 0; i < titles.length; i += BATCH_SIZE) {
    const batch = titles.slice(i, i + BATCH_SIZE);
    let continueParams: Record<string, string> = {};
    let hasMore = true;

    do {
      const params = {
        action: 'query',
        prop: ['info', 'categories'],
        titles: batch,
        redirects: '1',
        converttitles: '1',
        clshow: '!hidden',
        cllimit: 'max',
        ...continueParams,
      };

      const res = await moegirl.post(params);
      const query = (res as { query?: { pages?: Array<{ pageid?: number; title: string; missing?: boolean; categories?: Array<{ title: string }> }> } }).query || {};
      const pages = query.pages || [];

      // 收集顶层 converted 和 redirects
      const topRedirects = (res as { query?: { redirects?: Array<{ from: string; to: string }> } }).query?.redirects || [];
      const topConverted = (res as { query?: { converted?: Array<{ from: string; to: string }> } }).query?.converted || [];
      for (const r of topRedirects) { redirectMap.set(r.from, r.to); }
      for (const c of topConverted) { convertedMap.set(c.from, c.to); }

      for (const page of pages) {
        const isMissing = (page as { missing?: boolean }).missing === true;
        const hasPageId = 'pageid' in page && !isMissing;
        const categoryNames = (page.categories || []).map((c) => c.title.replace(/^Category:/, ''));
        const isDisambiguation = categoryNames.includes('消歧义页');

        // 通过 converted/redirect 反向查找原始标题
        let originalTitle: string | undefined;
        for (const [from, to] of convertedMap) {
          if (to === page.title) { originalTitle = from; break; }
        }
        if (!originalTitle) {
          for (const [from, to] of redirectMap) {
            if (to === page.title) { originalTitle = from; break; }
          }
        }

        const info: PageInfo = {
          pageId: hasPageId ? (page as { pageid: number }).pageid : null,
          title: page.title,
          isDisambiguation,
          categories: categoryNames,
        };

        if (originalTitle && originalTitle !== page.title) {
          // 查找哪个 batch 中的原始查询标题匹配
          for (const t of batch) {
            if (convertedMap.get(t) === page.title || redirectMap.get(t) === page.title) {
              if (convertedMap.has(t)) { info.convertedFrom = t; }
              if (redirectMap.has(t)) { info.redirectTo = t; }
              result.set(t, info);
            }
          }
          // 也存原始标题
          result.set(originalTitle, info);
        }

        result.set(page.title, info);
      }

      const cont = (res as { continue?: Record<string, string> }).continue;
      if (cont && (cont.clcontinue || cont.continue)) {
        continueParams = {};
        if (cont.clcontinue) { continueParams.clcontinue = cont.clcontinue; }
        if (cont.continue) { continueParams.continue = cont.continue; }
      } else {
        hasMore = false;
      }
    } while (hasMore);
  }

  return result;
};

export default moegirl;
