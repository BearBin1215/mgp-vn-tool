import { invoke } from '@tauri-apps/api/core';

/** Bangumi 单部作品（原名、中文名、发行日期） */
export interface BangumiWork {
  name: string;
  name_cn: string | null;
  date: string | null;
  /** 日期获取失败时的注释 */
  note: string | null;
}

/** Bangumi 会社原始数据 */
export interface BangumiCompany {
  id: number;
  name: string;
  aliases: string[];
  official_website: string | null;
}

/** Bangumi 会社查询结果（会社信息 + 各分类作品列表） */
export interface BangumiCompanyData {
  company: BangumiCompany;
  anime: BangumiWork[];
  music: BangumiWork[];
  book: BangumiWork[];
}

/** 根据 Bangumi person id 抓取会社信息与各分类作品列表 */
export function queryBangumiCompany(bgmPersonId: number) {
  return invoke<BangumiCompanyData>('query_bangumi_company', { bgmPersonId });
}
