import { useState, type ReactNode } from 'react';
import { Button, Tooltip, Modal } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface HelpButtonProps {
  /** 帮助弹窗列表项内容 */
  children: ReactNode;
}

/** 使用帮助按钮，点击后弹出统一样式的帮助弹窗 */
export default function HelpButton({ children }: HelpButtonProps) {
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      <Tooltip title={t('使用帮助')}>
        <Button
          type='text'
          icon={<QuestionCircleOutlined />}
          onClick={() => setHelpModalOpen(true)}
        />
      </Tooltip>
      <Modal
        open={helpModalOpen}
        title={t('使用帮助')}
        footer={null}
        onCancel={() => setHelpModalOpen(false)}
        width={620}
      >
        <ul className='pl-4 m-0 list-disc'>
          {children}
        </ul>
      </Modal>
    </>
  );
}
