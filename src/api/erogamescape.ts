import { invoke } from '@tauri-apps/api/core';
import type { GameRecord, CreatorRecord, QueryResult } from '@/lib/types';

export type { GameRecord, CreatorRecord, QueryResult };

interface ErogamescapeResponse<T> {
  statusCode: string;
  result: 'success' | 'fail';
  response: T;
}

/** 处理后端批评空间响应 */
export function unwrap<T>(res: ErogamescapeResponse<T>): T {
  if (res.result === 'fail') {
    throw new Error(String(res.response || '批评空间请求失败'));
  }
  return res.response;
}

/** 根据创作者id读取参与作品信息 */
export async function queryCreatorWorks(creatorId: number): Promise<QueryResult> {
  const res = await invoke<ErogamescapeResponse<QueryResult>>('query_creator_works', { creatorId });
  return unwrap(res);
}

/** 根据关键词搜索创作者 */
export async function searchCreators(keyword: string): Promise<CreatorRecord[]> {
  const res = await invoke<ErogamescapeResponse<CreatorRecord[]>>('search_creators', { keyword });
  return unwrap(res);
}
