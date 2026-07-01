import type { ReactNode } from 'react';
import { App, Button, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';

interface HelpButtonProps {
  /** 帮助弹窗列表项内容 */
  children: ReactNode;
}

/** 使用帮助按钮，点击后通过 App.useApp().modal 弹出统一样式的帮助弹窗 */
export default function HelpButton({ children }: HelpButtonProps) {
  const { modal } = App.useApp();

  const handleClick = () => {
    modal.info({
      title: '使用帮助',
      width: 620,
      footer: null,
      content: (
        <ul className='pl-4 m-0 list-disc'>
          {children}
        </ul>
      ),
    });
  };

  return (
    <Tooltip title='使用帮助'>
      <Button
        type='text'
        icon={<QuestionCircleOutlined />}
        onClick={handleClick}
      />
    </Tooltip>
  );
}
