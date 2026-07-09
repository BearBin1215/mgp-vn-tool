import { useNavigate, useLocation } from 'react-router';
import {
  Layout as AntLayout,
  Menu as AntMenu,
  Divider,
  BorderBeam,
  type MenuProps,
} from 'antd';
import { routes, type RouteConfig } from '@/routes';

const topRoutes = routes.filter((r) => r.path !== '/' && (r.position ?? 'top') === 'top');
const bottomRoutes = routes.filter((r) => r.path !== '/' && (r.position ?? 'bottom') === 'bottom');

/** 将路由配置转为 antd Menu 的 items，二级菜单分组以 label 作为 key */
function buildMenuItems(configs: RouteConfig[]): MenuProps['items'] {
  return configs.map((r) => {
    if (r.children) {
      return {
        key: r.label!,
        icon: r.icon,
        label: r.label,
        children: buildMenuItems(r.children),
      };
    }
    return {
      key: r.path!,
      icon: r.icon,
      label: r.label,
    };
  });
}

/** 收集所有二级菜单分组的 key（用于默认展开） */
function collectGroupKeys(configs: RouteConfig[]): string[] {
  return configs.filter((r) => r.children).map((r) => r.label!);
}

const topItems = buildMenuItems(topRoutes);
const bottomItems = buildMenuItems(bottomRoutes);
const topOpenKeys = collectGroupKeys(topRoutes);

/** 应用左侧菜单 */
export default function LayoutMenu() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleClick: MenuProps['onClick'] = ({ key }) => {
    // 仅叶子菜单（路径）触发导航，分组标题不处理
    if (key.startsWith('/')) {
      navigate(key);
    }
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
          defaultOpenKeys={topOpenKeys}
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
