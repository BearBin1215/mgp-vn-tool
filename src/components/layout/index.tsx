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
    <AntLayout className='h-screen'>
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
