import { Outlet } from 'react-router';
import { Layout as AntLayout } from 'antd';
import { useSettingsStore } from '@/stores/settingsStore';
import Menu from './Menu';
import './index.css';

const siderWidth = 240;

/** 基础布局 */
export default function Layout() {
  const colorMode = useSettingsStore((state) => state.colorMode);
  const backgroundImage = useSettingsStore((state) => state.backgroundImage);
  const backgroundImageTransparency = useSettingsStore((state) => state.backgroundImageTransparency);
  const alpha = backgroundImage ? backgroundImageTransparency / 100 : 1;

  return (
    <AntLayout
      className='relative h-screen z-10'
      style={{ background: colorMode === 'dark' ? `rgb(0 0 0 / ${alpha})` : `rgb(255 255 255 / ${alpha})` }}
    >
      <AntLayout.Sider
        width={siderWidth}
        theme={colorMode === 'dark' ? 'dark' : 'light'}
        className='layout-sider'
      >
        <Menu />
      </AntLayout.Sider>
      <AntLayout className='flex flex-col bg-transparent!'>
        <Outlet />
      </AntLayout>
    </AntLayout>
  );
}
