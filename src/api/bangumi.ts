import { invoke } from '@tauri-apps/api/core';

/** Bangumi 单部作品信息 */
export interface BangumiWork {
  /** 原名 */
  name: string;
  /** 中文名 */
  name_cn: string | null;
  /** 发布日期 */
  date: string | null;
  /** 日期获取失败时的注释 */
  note: string | null;
}

/** Bangumi 会社原始数据 */
export interface BangumiCompany {
  id: number;
  /** 原名 */
  name: string;
  /** 别名 */
  aliases: string[];
  /** 官方网站 */
  official_website: string | null;
}

/** Bangumi 会社查询结果（会社信息 + 各分类作品列表） */
export interface BangumiCompanyData {
  /** 基本信息 */
  company: BangumiCompany;
  /** 关联动画作品 */
  anime: BangumiWork[];
  /** 关联音乐作品 */
  music: BangumiWork[];
  /** 关联书籍作品 */
  book: BangumiWork[];
}

/** Bangumi 人物搜索结果项 */
export interface BangumiPersonSearchResult {
  id: number;
  name: string;
}

/** 按名称搜索 Bangumi producer（career 固定为 producer） */
export function searchBangumiPersons(keyword: string) {
  return invoke<BangumiPersonSearchResult[]>('search_bangumi_persons', { keyword });
}

/** 根据 Bangumi person id 抓取会社信息与各分类作品列表 */
export function queryBangumiCompany(bgmPersonId: number) {
  return invoke<BangumiCompanyData>('query_bangumi_company', { bgmPersonId });
}
