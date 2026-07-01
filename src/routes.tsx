import { flatMapDeep } from 'lodash-es';
import {
  AppstoreOutlined,
  AudioOutlined,
  BarChartOutlined,
  BankOutlined,
  SettingOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { GameIcon } from '@/icons';
import CvGenerator from '@/pages/cv-generator';
import CompanyGenerator from '@/pages/company-generator';
import WorkGenerator from '@/pages/work-generator';
import ArticleStats from '@/pages/article-stats';
import About from '@/pages/about';
import Settings from '@/pages/settings';

/** 菜单/路由配置，可包含子菜单实现二级菜单 */
export interface RouteConfig {
  /** 页面路径（二级菜单分组不使用） */
  path?: string;
  /** 页面组件（二级菜单分组不使用） */
  component?: React.ComponentType;
  /** 保持页面活跃（切换页面不卸载） */
  keepAlive?: boolean;
  /** 菜单标签（菜单及页顶显示名称） */
  label?: string;
  /** 菜单图标 */
  icon?: React.ReactNode;
  /** 菜单位置 */
  position?: 'top' | 'bottom';
  /** 子菜单项；存在时该条目作为二级菜单分组，自身不渲染页面 */
  children?: RouteConfig[];
}

/** 叶子路由（无子菜单，实际渲染页面的路由） */
export interface LeafRoute {
  /** 页面路径 */
  path: string;
  /** 页面组件 */
  component: React.ComponentType;
  /** 保持页面活跃（切换页面不卸载） */
  keepAlive?: boolean;
  /** 菜单标签（菜单及页顶显示名称） */
  label?: string;
  /** 菜单图标 */
  icon?: React.ReactNode;
  /** 菜单位置 */
  position?: 'top' | 'bottom';
}

export const routes: RouteConfig[] = [
  {
    path: '/',
    component: About,
    label: '关于',
    icon: <InfoCircleOutlined />,
  },
  {
    path: '/article-stats',
    component: ArticleStats,
    label: '条目统计',
    icon: <BarChartOutlined />,
    position: 'top',
    keepAlive: true,
  },
  {
    label: '条目生成',
    icon: <AppstoreOutlined />,
    position: 'top',
    children: [
      {
        path: '/work-generator',
        component: WorkGenerator,
        label: '作品条目生成',
        icon: <GameIcon />,
        keepAlive: true,
      },
      {
        path: '/cv-generator',
        component: CvGenerator,
        label: '里界声优条目生成',
        icon: <AudioOutlined />,
        keepAlive: true,
      },
      {
        path: '/company-generator',
        component: CompanyGenerator,
        label: '会社条目生成',
        icon: <BankOutlined />,
        keepAlive: true,
      },
    ],
  },
  {
    path: '/settings',
    component: Settings,
    label: '设置',
    icon: <SettingOutlined />,
    position: 'bottom',
  },
];

/** 扁平化路由，返回所有叶子路由（用于路由渲染、页顶标题、KeepAlive） */
export const flatRoutes = flatMapDeep(routes, (r): RouteConfig[] => r.children ?? [r]) as LeafRoute[];
