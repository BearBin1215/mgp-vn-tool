import { invoke } from '@tauri-apps/api/core';

const feishu = {
  /** 获取飞书表格内容（自动获取 token 并请求表格） */
  fetchSheet(appId: string, appSecret: string) {
    return invoke<string[][]>('feishu_fetch_sheet', { appId, appSecret });
  },

  /**
   * 向统计表末尾追加行（自动获取 token 并写入）
   * @param appId 飞书开放平台应用 App ID
   * @param appSecret 飞书开放平台应用 App Secret
   * @param rows 行数据，每行为 A~F 六列的值，须按创建时间升序排列。
   *   单元格支持混合类型：日期列须传数值型 Excel 序列号；
   *   公式列须传飞书公式对象 `{ type: 'formula', text: '=A1' }`，
   *   直接传字符串公式会被当作文本显示而不计算；其余列为普通字符串
   */
  appendRows(appId: string, appSecret: string, rows: unknown[][]) {
    return invoke<void>('feishu_append_rows', { appId, appSecret, rows });
  },
};

export default feishu;
