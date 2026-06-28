import { invoke } from '@tauri-apps/api/core';
import { unwrap, type ErogamescapeResponse } from '@/api/erogamescape';

/** 链接信息（显示文本 + URL） */
export interface LinkInfo {
  label: string;
  url: string;
}

/** 单部作品（原名、中文名、发行日期） */
export interface Work {
  original_title: string;
  chinese_title: string | null;
  date: string | null;
}

/** VNDB 关联会社/系列项 */
export interface CompanyRelation {
  label: string;
  links: LinkInfo[];
}

/** Bangumi 信息框键值对 */
export interface InfoItem {
  label: string;
  value: string;
}

/** VNDB 会社原始数据 */
export interface VndbCompany {
  id: number;
  name: string;
  aliases: string[];
  official_website: LinkInfo | null;
  relations: CompanyRelation[];
  description: string;
  releases: { vn_id: string; romanized_title: string; date: string | null }[];
}

/** Bangumi 会社原始数据 */
export interface BangumiCompany {
  id: number;
  name: string;
  aliases: string[];
  official_website: LinkInfo | null;
  image_url: string | null;
  info_items: InfoItem[];
}

/** 会社条目生成的原始数据（前端渲染 wikitext 所需） */
export interface CompanyData {
  vndb: VndbCompany;
  bangumi: BangumiCompany | null;
  galgames: Work[];
  anime: Work[];
  music: Work[];
  book: Work[];
}

/** 根据 VNDB producer id（可选 Bangumi person id）抓取会社原始数据 */
export async function queryCompanyData(
  producerId: number,
  bgmPersonId: number | null,
): Promise<CompanyData> {
  const res = await invoke<ErogamescapeResponse<CompanyData>>('query_company_data', {
    producerId,
    bgmPersonId,
  });
  return unwrap(res);
}
