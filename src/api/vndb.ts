import { invoke } from '@tauri-apps/api/core';

/** VNDB 单部作品（原名、中文名、发行日期、VN id、关联关系） */
export interface VndbWork {
  original_title: string;
  chinese_title: string | null;
  date: string | null;
  /** VN id（如 "v32269"），用于关联层级判定 */
  id: string;
  /** 与其他 VN 的关联（relation 类型 + 目标 VN id） */
  relations: { relation: string; id: string }[];
  /** 行尾编辑注释，无则为 null */
  note: string | null;
}

/** VNDB producer（制作组织）原始数据 */
export interface VndbProducer {
  id: number;
  name: string;
  aliases: string[];
  description: string;
  /** 官网链接 */
  official_website: string | null;
  /** X（原 Twitter）链接 */
  twitter: string | null;
  /** YouTube 链接 */
  youtube: string | null;
}

/** VNDB producer 查询结果（制作组织信息 + 开发作品列表） */
export interface VndbProducerData {
  producer: VndbProducer;
  galgames: VndbWork[];
}

/** VNDB producer 搜索结果项 */
export interface VndbProducerSearchResult {
  /** 纯数字 id（如 "24"） */
  id: string;
  name: string;
  /** 原文（假名等）名称，无则 null */
  original: string | null;
  aliases: string[];
  /** producer 类型：co(会社)/in(个人)/ng(同人团体) */
  type: string | null;
}

/** 根据 VNDB producer id 抓取制作组织信息与开发作品列表 */
export function queryVndbProducer(producerId: number) {
  return invoke<VndbProducerData>('query_vndb_producer', { producerId });
}

/** 按名称搜索 VNDB producer，返回最多 10 个匹配项 */
export function searchVndbProducers(keyword: string) {
  return invoke<VndbProducerSearchResult[]>('search_vndb_producers', { keyword });
}
