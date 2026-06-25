import React from 'react';
import ReactDOM from 'react-dom/client';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { initSettings, useSettingsStore } from '@/stores/settingsStore';
import { initMoegirlData } from '@/stores/moegirlStore';
import { initArticles } from '@/stores/articleStore';
import App from './App';

dayjs.locale('zh-cn');

document.addEventListener('keydown', (e) => {
  // 阻止 webview 的默认快捷键和 Fn 键行为，假装自己不是个浏览器
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    if (['j', 'p', 'g', 'r'].includes(e.key.toLowerCase())) {
      e.preventDefault();
    }
  }
  if (['F3', 'F5'].includes(e.key)) {
    e.preventDefault();
  }
});

// 先初始化设置（含登录态检查），首屏渲染只依赖它
// 萌百用户数据和条目数据非首屏必需，渲染后异步加载，store 更新自动触发重渲染
(async () => {
  await initSettings();
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  void Promise.all([
    initMoegirlData(!!useSettingsStore.getState().moegirlUsername),
    initArticles(),
  ]);
})();
