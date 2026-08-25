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
   * @param rows 行数据，每行为 A~E 五列的值，须按创建时间升序排列
   */
  appendRows(appId: string, appSecret: string, rows: string[][]) {
    return invoke<void>('feishu_append_rows', { appId, appSecret, rows });
  },
};

export default feishu;
