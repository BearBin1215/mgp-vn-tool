import { Outlet } from 'react-router';
import { Layout as AntLayout } from 'antd';
import { useSettingsStore } from '@/stores/settingsStore';
import Menu from './Menu';
import './index.css';

const siderWidth = 240;

/** 基础布局 */
export default function Layout() {
  const colorMode = useSettingsStore((state) => state.colorMode);

  return (
    <AntLayout
      className='relative h-screen z-10'
      style={{ background: colorMode === 'dark' ? 'rgb(0 0 0 / 0.8)' : 'rgb(245 245 245 / 0.8)' }}
    >
      <AntLayout.Sider
        width={siderWidth}
        theme={colorMode === 'dark' ? 'dark' : 'light'}
        className='layout-sider'
      >
        <Menu />
      </AntLayout.Sider>
      <AntLayout className='flex flex-col'>
        <Outlet />
      </AntLayout>
    </AntLayout>
  );
}
