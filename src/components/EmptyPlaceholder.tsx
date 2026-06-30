import { Empty } from 'antd';

interface EmptyPlaceholderProps {
  /** 空状态提示文案 */
  description: string;
}

/** 空状态占位：用于在尚未生成数据时占据内容区 */
export default function EmptyPlaceholder({ description }: EmptyPlaceholderProps) {
  return (
    <div
      className={`
        flex-1 min-h-0 grid place-items-center
        border border-dashed border-(--ant-color-border)
        bg-(--ant-color-bg-container)
      `}
    >
      <Empty description={description} />
    </div>
  );
}
