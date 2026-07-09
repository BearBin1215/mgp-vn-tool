import { BrowserRouter, Routes, Route } from 'react-router';
import { ConfigProvider, App as AntApp, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Background from '@/components/Background';
import Layout from '@/components/layout';
import KeepAlive from '@/components/KeepAlive';
import { flatRoutes } from '@/routes';
import { useSettingsStore } from '@/stores/settingsStore';
import './App.css';

const keepAliveRoutes = flatRoutes.map((r) => ({ path: r.path, element: <r.component />, keepAlive: r.keepAlive }));

export default function App() {
  const colorMode = useSettingsStore((s) => s.colorMode);
  const uiFont = useSettingsStore((s) => s.uiFont);
  const codeFont = useSettingsStore((s) => s.codeFont);

  return (
    <ConfigProvider
      locale={zhCN}
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
