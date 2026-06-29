import {
  AudioOutlined,
  BarChartOutlined,
  BankOutlined,
  SettingOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import CvGenerator from '@/pages/cv-generator';
import CompanyGenerator from '@/pages/company-generator';
import ArticleStats from '@/pages/article-stats';
import About from '@/pages/about';
import Settings from '@/pages/settings';

export interface RouteConfig {
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
    path: '/cv-generator',
    component: CvGenerator,
    label: '里界声优条目生成',
    icon: <AudioOutlined />,
    position: 'top',
    keepAlive: true,
  },
  {
    path: '/company-generator',
    component: CompanyGenerator,
    label: '会社条目生成',
    icon: <BankOutlined />,
    position: 'top',
    keepAlive: true,
  },
  {
    path: '/settings',
    component: Settings,
    label: '设置',
    icon: <SettingOutlined />,
    position: 'bottom',
  },
];
