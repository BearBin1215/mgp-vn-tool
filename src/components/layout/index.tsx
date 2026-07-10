import { Outlet } from 'react-router';
import { Layout as AntLayout } from 'antd';
import { useSettingsStore } from '@/stores/settings-store';
import Menu from './menu';
import './index.css';

const siderWidth = 240;

/** 基础布局 */
export default function Layout() {
  const colorMode = useSettingsStore((state) => state.colorMode);

  return (
    <AntLayout className='relative h-screen z-10 bg-transparent!'>
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
