import { invoke } from '@tauri-apps/api/core';
import type { ToolErrorShape } from '@/utils/error';

/** 飞书追加结果；样式失败不会回滚已写入的数据。 */
export interface FeishuAppendResult {
  /** 飞书返回的实际写入范围 */
  updated_range: string | null;
  /** 数据已写入但样式设置失败时的警告（结构化错误，展示时经 formatError 翻译） */
  style_warnings: ToolErrorShape[];
}

/** 统计表读取结果的一行业务字段；物理列布局和日期解析由 Rust 端统一处理。 */
export interface FeishuSheetRow {
  /** 日文原名 */
  original_name: string;
  /** 条目名（原行该列为空时已由后端回退为原名） */
  title: string;
  /** 制作组织 */
  brand: string;
  /** 发行时间，格式 YYYY-MM-DD */
  release_date: string;
  /** 创建时间，格式 YYYY-MM-DD */
  creation_date: string;
}

/** 统计表追加行的业务字段；物理列顺序由 Rust 端统一处理。 */
export interface FeishuAppendRow {
  /** 日文原名 */
  original_name: string;
  /** 条目名 */
  title: string;
  /** 制作组织 */
  brand: string;
  /** 发行时间，格式 YYYY-MM-DD */
  release_date: string;
  /** 创建时间，格式 YYYY-MM-DD */
  creation_date: string;
}

const feishu = {
  /** 获取飞书表格内容（凭证由后端从设置存储读取，返回已解析的结构化行） */
  fetchSheet() {
    return invoke<FeishuSheetRow[]>('feishu_fetch_sheet');
  },

  /**
   * 向统计表末尾追加行（凭证与已有行数均由后端自行获取）
   * @param rows 行数据，须按创建时间升序排列
   */
  appendRows(rows: FeishuAppendRow[]) {
    return invoke<FeishuAppendResult>('feishu_append_rows', { rows });
  },
};

export default feishu;
