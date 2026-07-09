import type { ReactNode } from 'react';

interface AboutItemProps {
  /** 左侧图标 */
  icon?: ReactNode;
  /** 左侧文本 */
  label: ReactNode;
  /** 右侧内容 */
  children: ReactNode;
}

export default function AboutItem({ icon, label, children }: AboutItemProps) {
  return (
    <div className='flex justify-between items-center'>
      <div className='flex gap-2 min-w-30'>
        {icon}
        {label}
      </div>
      <div className='overflow-hidden text-ellipsis whitespace-nowrap text-right'>
        {children}
      </div>
    </div>
  );
}
