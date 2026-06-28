import { Button, Tooltip, App } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

interface CopyButtonProps {
  /** 待复制的文本 */
  text: string;
}

/** 复制文本到剪贴板的按钮 */
export default function CopyButton({ text }: CopyButtonProps) {
  const { message } = App.useApp();
  return (
    <Tooltip title='复制到剪贴板'>
      <Button
        type='text'
        size='small'
        icon={<CopyOutlined />}
        disabled={!text}
        onClick={async () => {
          try {
            await writeText(text);
            message.success('已复制到剪贴板');
          } catch (e) {
            message.error(`复制失败: ${e instanceof Error ? e.message : e}`);
          }
        }}
      >
        复制
      </Button>
    </Tooltip>
  );
}
