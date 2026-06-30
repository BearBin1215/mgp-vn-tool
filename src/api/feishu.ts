import { invoke } from '@tauri-apps/api/core';

const feishu = {
  /** 获取飞书表格内容（自动获取 token 并请求表格） */
  fetchSheet(appId: string, appSecret: string) {
    return invoke<string[][]>('feishu_fetch_sheet', { appId, appSecret });
  },
};

export default feishu;
