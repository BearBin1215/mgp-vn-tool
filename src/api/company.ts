import { invoke } from '@tauri-apps/api/core';
import { unwrap } from '@/api/erogamescape';

interface ApiResponse<T> {
  statusCode: string;
  result: 'success' | 'fail';
  response: T;
}

export interface LinkInfo {
  label: string;
  url: string;
}

export interface CompanySummary {
  name: string;
  aliases: string[];
  official_website?: LinkInfo | null;
  url: string;
}

export interface GeneratedCompanyArticle {
  wikitext: string;
  vndb: CompanySummary;
  bangumi?: CompanySummary | null;
  counts: Record<string, number>;
}

/** 调用后端生成 Galgame 会社条目 wikitext */
export async function generateCompanyWikitext(
  producerId: number,
  bgmPersonId: number | null,
  force: boolean,
): Promise<GeneratedCompanyArticle> {
  const res = await invoke<ApiResponse<GeneratedCompanyArticle>>('generate_company_wikitext', {
    producerId,
    bgmPersonId,
    force,
  });
  return unwrap(res);
}
