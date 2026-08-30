import { invoke } from '@tauri-apps/api/core';
import type { ToolErrorShape } from '@/utils/text';

/** 飞书追加结果；样式失败不会回滚已写入的数据。 */
export interface FeishuAppendResult {
  /** 飞书返回的实际写入范围 */
  updated_range: string | null;
  /** 数据已写入但样式设置失败时的警告（结构化错误，展示时经 formatError 翻译） */
  style_warnings: ToolErrorShape[];
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
  /** 获取飞书表格内容（自动获取 token 并请求表格） */
  fetchSheet(appId: string, appSecret: string) {
    return invoke<string[][]>('feishu_fetch_sheet', { appId, appSecret });
  },

  /**
   * 向统计表末尾追加行（自动获取 token 并写入）
   * @param appId 飞书开放平台应用 App ID
   * @param appSecret 飞书开放平台应用 App Secret
   * @param existingRowCount 当前表格的数据行数，用于生成新增行的序号公式
   * @param rows 行数据，须按创建时间升序排列
   */
  appendRows(appId: string, appSecret: string, existingRowCount: number, rows: FeishuAppendRow[]) {
    return invoke<FeishuAppendResult>('feishu_append_rows', {
      appId,
      appSecret,
      existingRowCount,
      rows,
    });
  },
};

export default feishu;
