import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '@/stores/settingsStore';
import { ApiParams } from '@/lib/types';

interface TokenQueryResponse {
  query?: {
    tokens?: Record<string, string>;
  };
}

/** 本次会话中使用过的 token，减少重复获取 */
const tokenCache = new Map<string, string>();

const moegirl = {
  get(params: ApiParams): Promise<Record<string, unknown>> {
    const { moegirlApiHost: host, moegirlUserAgent: userAgent } = useSettingsStore.getState();
    return invoke<Record<string, unknown>>('moegirl_request', {
      host,
      method: 'GET',
      params,
      userAgent,
    });
  },

  post(params: ApiParams): Promise<Record<string, unknown>> {
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
    return moegirl.post({ ...params, [`${tokenType}token`]: token });
  },

  /** 检查登录状态 */
  checkLogin(): Promise<string | null> {
    return invoke<string | null>('moegirl_check_login');
  },

  /** 获取当前用户的 groups 和 rights */
  async getUserRights(): Promise<{ groups: string[]; rights: string[] }> {
    const res = await moegirl.post({
      action: 'query',
      meta: 'userinfo',
      uiprop: ['groups', 'rights'],
    });
    const userinfo = (res as { query?: { userinfo?: { groups?: string[]; rights?: string[] } } }).query?.userinfo;
    return { groups: userinfo?.groups || [], rights: userinfo?.rights || [] };
  },

  /** 退出登录，清空 token 缓存 */
  logout(): Promise<void> {
    tokenCache.clear();
    return invoke<void>('moegirl_logout');
  },
};

export default moegirl;
