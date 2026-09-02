import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import zhHK from './zh-HK';
import zhTW from './zh-TW';

/** 界面语言；繁体支持台湾繁体与香港繁体 */
export type UiLanguage = 'zh-CN' | 'zh-TW' | 'zh-HK';

/** 窗口标题的文案 key，即简体原文 */
const APP_TITLE_KEY = '萌百视研会条目工具';

/** i18next 是否已完成初始化 */
let initialized = false;

/**
 * 将原生窗口标题同步为当前界面语言的文案
 */
async function syncWindowTitle(): Promise<void> {
  try {
    await getCurrentWindow().setTitle(i18next.t(APP_TITLE_KEY));
  } catch (error) {
    console.error('同步窗口标题失败:', error);
  }
}

/**
 * 初始化 i18next 并切换到指定语言
 *
 * 采用 natural key 模式：key 即简体原文（含 {{}} 插值占位），
 * 简体语言包为空，缺失 key 返回原文；繁体查对应地区映射包（zh-TW / zh-HK），未收录的 key 回退简体。
 * @param lang 初始界面语言
 */
export async function initI18n(lang: UiLanguage = 'zh-CN'): Promise<void> {
  if (!initialized) {
    await i18next.use(initReactI18next).init({
      lng: 'zh-CN',
      fallbackLng: 'zh-CN',
      // key 即简体原文，禁用 key 与命名空间分隔符，避免原文中冒号、点号被误解析
      keySeparator: false,
      nsSeparator: false,
      resources: {
        'zh-CN': { translation: {} },
        'zh-TW': { translation: zhTW },
        'zh-HK': { translation: zhHK },
      },
      // 文案中可能包含用户数据等 HTML 内容，禁用转义（React 自行处理）
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    });
    initialized = true;
  }
  if (i18next.language !== lang) {
    await i18next.changeLanguage(lang);
  }
  // 启动语言就绪后同步原生窗口标题
  void syncWindowTitle();
}

/**
 * 切换界面语言，触发 languageChanged 事件使所有 useTranslation 组件重渲染
 * @param lang 目标语言
 */
export async function changeUiLanguage(lang: UiLanguage): Promise<void> {
  if (initialized && i18next.language !== lang) {
    await i18next.changeLanguage(lang);
    // 切换语言后同步原生窗口标题
    void syncWindowTitle();
  }
}
