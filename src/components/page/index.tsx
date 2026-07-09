import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { Layout as AntLayout, Typography } from 'antd';
import { flatRoutes } from '@/routes';

interface PageProps {
  /** 页顶右侧的操作按钮区域 */
  actions?: ReactNode;
  /** 页顶标题旁的副标题 */
  subtitle?: ReactNode;
  /** 是否给内容区添加 padding，默认 true */
  padding?: boolean;
  /** 自定义内容区的 className */
  className?: string;
  /** 页面内容 */
  children: ReactNode;
}

export default function Page({ actions, subtitle, padding = true, className, children }: PageProps) {
  const location = useLocation();
  const label = flatRoutes.find((r) => r.path === location.pathname)?.label || '';

  return (
    <>
      <AntLayout.Header
        className='flex items-center px-6! flex-none gap-4 border-b border-(--ant-color-border-secondary)'
      >
        <span className='text-base font-semibold'>{label}</span>
        {subtitle && <Typography.Text type='secondary' className='text-xs'>{subtitle}</Typography.Text>}
        <span className='flex-1' />
        <div className='flex items-center gap-2'>{actions}</div>
      </AntLayout.Header>
      <AntLayout.Content className={`overflow-auto flex-1 min-h-0 bg-(--ant-layout-body-bg) ${padding ? 'p-3' : ''} ${className || ''}`}>
        {children}
      </AntLayout.Content>
    </>
  );
}
