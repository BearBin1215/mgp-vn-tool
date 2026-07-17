import { invoke } from '@tauri-apps/api/core';

/** VNDB 作品信息 */
export interface VndbWork {
  /** 原名 */
  original_title: string;
  /** 中文名 */
  chinese_title: string | null;
  /** 发行日期 */
  date: string | null;
  /** VN id（如 "v32269"），用于关联层级判定 */
  id: string;
  /** 与其他 VN 的关联（relation 类型 + 目标 VN id） */
  relations: { relation: string; id: string }[];
}

/** VNDB producer（制作组织）原始数据 */
export interface VndbProducer {
  id: number;
  name: string;
  /** 别名 */
  aliases: string[];
  /** 组织介绍 */
  description: string;
  /** 官网链接 */
  official_website: string | null;
  /** X（原 Twitter）链接 */
  twitter: string | null;
  /** YouTube 链接 */
  youtube: string | null;
}

/** VNDB producer 查询结果 */
export interface VndbProducerData {
  /** 制作组织信息 */
  producer: VndbProducer;
  /** 作品列表 */
  galgames: VndbWork[];
}

/** VNDB producer 搜索结果项 */
export interface VndbProducerSearchResult {
  /** 纯数字 id（如 "24"） */
  id: string;
  name: string;
  /** 原文（假名等）名称，无则 null */
  original: string | null;
  /** 别名 */
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
