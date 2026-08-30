import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhTW from './zh-TW';

/** 界面语言；繁体暂只支持台湾正体 */
export type UiLanguage = 'zh-CN' | 'zh-TW';

/** i18next 是否已完成初始化 */
let initialized = false;

/**
 * 初始化 i18next 并切换到指定语言
 *
 * 采用 natural key 模式：key 即简体原文（含 {{}} 插值占位），
 * 简体语言包为空，缺失 key 返回原文；繁体查 zh-TW 映射包，未收录的 key 回退简体。
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
}

/**
 * 切换界面语言，触发 languageChanged 事件使所有 useTranslation 组件重渲染
 * @param lang 目标语言
 */
export async function changeUiLanguage(lang: UiLanguage): Promise<void> {
  if (initialized && i18next.language !== lang) {
    await i18next.changeLanguage(lang);
  }
}
