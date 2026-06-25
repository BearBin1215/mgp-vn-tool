import { useNavigate, useLocation } from 'react-router';
import { Layout as AntLayout, Menu as AntMenu, Divider, BorderBeam } from 'antd';
import type { MenuProps } from 'antd';
import { routes } from '@/routes';

const menuItems = routes
  .filter((r) => r.path !== '/' && (r.position ?? 'top') === 'top')
  .map((r) => ({ text: r.label!, icon: r.icon!, path: r.path }));

const bottomMenuItems = routes
  .filter((r) => r.path !== '/' && (r.position ?? 'bottom') === 'bottom')
  .map((r) => ({ text: r.label!, icon: r.icon!, path: r.path }));

/** 应用左侧菜单 */
export default function LayoutMenu() {
  const navigate = useNavigate();
  const location = useLocation();

  const topItems: MenuProps['items'] = menuItems.map((item) => ({
    key: item.path,
    icon: item.icon,
    label: item.text,
  }));

  const bottomItems: MenuProps['items'] = bottomMenuItems.map((item) => ({
    key: item.path,
    icon: item.icon,
    label: item.text,
  }));

  const handleClick: MenuProps['onClick'] = ({ key }) => {
    navigate(String(key));
  };

  return (
    <div className='flex flex-col h-full'>
      <div className='relative'>
        <BorderBeam
          color={[
            { color: '#22c55e', percent: 0 },
            { color: '#a3e635', percent: 54 },
            { color: '#facc15', percent: 100 },
          ]}
        >
          <div className='absolute inset-0 pointer-events-none' />
        </BorderBeam>
        <AntLayout.Header
          className={`
            relative text-center p-0!
            cursor-pointer font-bold text-base
            border-b border-(--ant-color-border-secondary)
            bg-(--ant-color-bg-container)!
          `}
          onClick={() => navigate('/')}
        >
          视研会条目工具
        </AntLayout.Header>
      </div>
      <div className='flex-1 overflow-auto'>
        <AntMenu
          className='border-0!'
          mode='inline'
          selectedKeys={[location.pathname]}
          items={topItems}
          onClick={handleClick}
        />
      </div>
      <Divider className='m-0!' />
      <AntMenu
        className='border-0!'
        mode='inline'
        selectedKeys={[location.pathname]}
        items={bottomItems}
        onClick={handleClick}
      />
    </div>
  );
}
