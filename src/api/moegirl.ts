import { invoke } from '@tauri-apps/api/core';
import type { ApiQueryResponse } from 'types-mediawiki-response';
import { useSettingsStore } from '@/stores/settings-store';
import { useMoegirlStore } from '@/stores/moegirl-store';
import { isToolError } from '@/utils/error';
import type { ApiParams } from '@/lib/types';

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

/** 服务端明确表示未登录时，清理本地凭据和用户信息缓存 */
const clearInvalidLogin = async (error: unknown): Promise<void> => {
  // 后端萌百 API 错误为结构化错误，MediaWiki 错误码位于 params.code
  const notLoggedIn = isToolError(error)
    ? error.code === 'moegirl_api_error' && error.params?.code === 'notloggedin'
    : String(error).includes('[notloggedin]');
  if (!notLoggedIn) {
    return;
  }
  useSettingsStore.setState({ moegirlUsername: '' });
  await Promise.allSettled([
    invoke<void>('moegirl_logout'),
    useMoegirlStore.getState().clearUserInfo(),
  ]);
};

/** 调用萌百后端命令，并在服务端明确判定未登录时同步清理本地状态 */
const command = async <T>(cmd: string, args: Record<string, unknown>): Promise<T> => {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    await clearInvalidLogin(e);
    throw e;
  }
};

const moegirl = {
  post(params: ApiParams) {
    return command<unknown>('moegirl_request', { method: 'POST', params });
  },

  /** 登录萌百，成功时返回用户名 */
  login(username: string, password: string): Promise<string> {
    return command<string>('moegirl_login', { username, password });
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
    }) as ApiQueryResponse;
    const user = res.query?.users?.[0];
    return {
      groups: user?.groups || [],
      rights: user?.rights || [],
      displayname: user?.displayname ?? null,
      displaytag: user?.displaytag ?? null,
    };
  },

  /** 退出登录 */
  logout(): Promise<void> {
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

/**
 * 批量查询页面信息，返回标题到页面信息的映射
 *
 * 键包括规范标题与命中该页面的繁简转换、重定向原始查询标题。
 */
export const fetchPageInfo = async (titles: string[]): Promise<Map<string, PageInfo>> => {
  const res = await command<Record<string, PageInfo>>('moegirl_query_page_info', { titles });
  return new Map(Object.entries(res));
};

/** 页面分类与重定向数据 */
export interface PageDataEntry {
  /** 页面分类（已过滤日本游戏作品、XXX作品、PAGENAME 等冗余分类） */
  categories: string[];
  /** 该标题为重定向时的目标标题 */
  redirectTo?: string;
  /** 指向该页面的重定向标题列表 */
  pageRedirects: string[];
}

/** 批量查询页面分类与重定向数据，返回标题（含重定向原始标题）到数据的映射 */
export const queryPageData = async (titles: string[]): Promise<Map<string, PageDataEntry>> => {
  const res = await command<Record<string, PageDataEntry>>('moegirl_query_page_data', { titles });
  return new Map(Object.entries(res));
};

/** logevents 单条日志 */
export interface LogEvent {
  /** 日志 id，用于同时间戳事件的排序 */
  logid?: number;
  /** 页面标题 */
  title: string;
  /** 时间戳（ISO 8601） */
  timestamp: string;
  /** 日志详情（move 类型时含移动目标） */
  params?: {
    /** 目标命名空间 */
    targetNs?: number;
    /** 移动目标标题 */
    targetTitle?: string;
  };
}

/**
 * 抓取时间段内主命名空间的全部指定类型日志
 *
 * logevents 从新到旧枚举，与直觉方向相反：
 * @param eventType 日志类型（create/move）
 * @param startIso 较早的时间下界（含）
 * @param endIso 较晚的时间上界（含）
 */
export const queryLogEvents = (
  eventType: string,
  startIso: string,
  endIso: string,
): Promise<LogEvent[]> =>
  command<LogEvent[]>('moegirl_query_log_events', { eventType, startIso, endIso });

/** 批量获取页面 wikitext 源代码，返回标题到源代码的映射（缺失或已删除的页面不在结果中） */
export const queryPageWikitexts = async (titles: string[]): Promise<Map<string, string>> => {
  const res = await command<Record<string, string>>('moegirl_query_page_wikitexts', { titles });
  return new Map(Object.entries(res));
};

export default moegirl;
