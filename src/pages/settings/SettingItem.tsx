import type { ReactNode } from 'react';
import {
  Typography,
  Tooltip,
} from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';

interface SettingItemProps {
  /** 设置名称 */
  label: ReactNode;
  /** 设置描述 */
  description?: string;
  /** 帮助说明 */
  help?: ReactNode;
  /** 右侧自定义内容 */
  children: ReactNode;
}

/** 设置项目 */
export default function SettingItem({ label, description, help, children }: SettingItemProps) {
  return (
    <div className='flex flex-wrap items-center'>
      <div className='flex-[1_0_300px]'>
        <div className='flex items-center gap-1'>
          {label}
          {help && (
            <Tooltip
              title={help}
            >
              <QuestionCircleOutlined className='text-(--ant-color-text-tertiary) cursor-help' />
            </Tooltip>
          )}
        </div>
        {description && <Typography.Text type='secondary' className='text-xs'>{description}</Typography.Text>}
      </div>
      <div className='flex-[0_0_240px] flex justify-end'>
        {children}
      </div>
    </div>
  );
}
