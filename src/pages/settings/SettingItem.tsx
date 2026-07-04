import type { ReactNode } from 'react';
import { Typography } from 'antd';

interface SettingItemProps {
  /** 设置名称 */
  label: ReactNode;
  /** 设置描述 */
  description?: string;
  /** 右侧自定义内容 */
  children: ReactNode;
}

/** 设置项目 */
export default function SettingItem({ label, description, children }: SettingItemProps) {
  return (
    <div className='flex flex-wrap items-center'>
      <div className='flex-[1_0_300px]'>
        <div>{label}</div>
        {description && <Typography.Text type='secondary' className='text-xs'>{description}</Typography.Text>}
      </div>
      <div className='flex-[0_0_240px] flex justify-end'>
        {children}
      </div>
    </div>
  );
}
