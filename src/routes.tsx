import {
  AudioOutlined,
  BarChartOutlined,
  SettingOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import CvGenerator from '@/pages/cv-generator';
import ArticleStats from '@/pages/article-stats';
import About from '@/pages/about';
import Settings from '@/pages/settings';

export interface RouteConfig {
  path: string;
  component: React.ComponentType;
  keepAlive?: boolean;
  label?: string;
  icon?: React.ReactNode;
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
    path: '/settings',
    component: Settings,
    label: '设置',
    icon: <SettingOutlined />,
    position: 'bottom',
  },
];
