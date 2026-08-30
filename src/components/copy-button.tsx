import { Button, Tooltip, App } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { formatError } from '@/utils/text';

interface CopyButtonProps {
  /** 待复制的文本 */
  text: string;
}

/** 复制文本到剪贴板的按钮 */
export default function CopyButton({ text }: CopyButtonProps) {
  const { message } = App.useApp();
  const { t } = useTranslation();
  return (
    <Tooltip title={t('复制到剪贴板')}>
      <Button
        type='text'
        size='small'
        icon={<CopyOutlined />}
        disabled={!text}
        onClick={async () => {
          try {
            await writeText(text);
            message.success(t('已复制到剪贴板'));
          } catch (e) {
            message.error(t('复制失败: {{detail}}', { detail: formatError(e) }));
          }
        }}
      >
        {t('复制')}
      </Button>
    </Tooltip>
  );
}
