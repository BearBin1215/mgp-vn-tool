import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router';
import { ConfigProvider, App as AntApp, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import zhTW from 'antd/locale/zh_TW';
import zhHK from 'antd/locale/zh_HK';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-tw';
import 'dayjs/locale/zh-hk';
import Background from '@/components/background';
import Layout from '@/components/layout';
import KeepAlive from '@/components/keep-alive';
import { flatRoutes } from '@/routes';
import { useSettingsStore } from '@/stores/settings-store';
import './App.css';

const keepAliveRoutes = flatRoutes.map((r) => ({ path: r.path, element: <r.component />, keepAlive: r.keepAlive }));

/** 各界面语言对应的 antd 组件文案包 */
const ANTD_LOCALES = { 'zh-CN': zhCN, 'zh-TW': zhTW, 'zh-HK': zhHK } as const;

/** 各界面语言对应的 dayjs locale */
const DAYJS_LOCALES = { 'zh-CN': 'zh-cn', 'zh-TW': 'zh-tw', 'zh-HK': 'zh-hk' } as const;

export default function App() {
  const colorMode = useSettingsStore((s) => s.colorMode);
  const uiFont = useSettingsStore((s) => s.uiFont);
  const codeFont = useSettingsStore((s) => s.codeFont);
  const uiLanguage = useSettingsStore((s) => s.uiLanguage);

  useEffect(() => {
    // 界面语言切换时同步 dayjs locale，供日期格式化使用
    dayjs.locale(DAYJS_LOCALES[uiLanguage]);
  }, [uiLanguage]);

  return (
    <ConfigProvider
      locale={ANTD_LOCALES[uiLanguage]}
      theme={{
        algorithm: colorMode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          fontFamily: uiFont || undefined,
          fontFamilyCode: codeFont || 'monospace',
        },
        components: {
          Card: {
            paddingLG: 16,
          },
        },
        cssVar: {
          key: 'css-var-mgp_vn_tool',
        },
      }}
      modal={{ centered: true }}
    >
      <AntApp className={colorMode === 'dark' ? 'dark-mode' : 'light-mode'}>
        <Background />
        <BrowserRouter>
          <Routes>
            <Route path='/' element={<Layout />}>
              <Route
                index
                element={<KeepAlive routes={keepAliveRoutes} />}
              />
              <Route
                path='*'
                element={<KeepAlive routes={keepAliveRoutes} />}
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}
