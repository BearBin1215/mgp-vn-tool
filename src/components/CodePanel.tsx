import { Spin, Typography } from 'antd';
import CopyButton from '@/components/CopyButton';

interface CodePanelProps {
  /** 生成的 wikitext */
  text: string;
  /** 是否加载/重新生成中（显示半透明遮罩 + Spin，代码保持可见） */
  loading?: boolean;
  /** 遮罩 Spin 文案 */
  loadingDescription?: string;
  /** inset=分栏内嵌（p-2 无圆角），standalone=独立（p-4 圆角），默认 inset */
  variant?: 'inset' | 'standalone';
}

/**
 * 生成结果代码面板
 *
 * 统一三个条目生成页的代码区结构：标题（生成结果 + 复制按钮）+ 代码区。
 * 加载时用半透明遮罩 + 居中 Spin 覆盖代码区，代码始终保持可见（而非被替换）。
 */
export default function CodePanel({ text, loading, loadingDescription, variant = 'inset' }: CodePanelProps) {
  const standalone = variant === 'standalone';
  return (
    <>
      <div className={`flex items-center justify-between shrink-0 px-1 ${standalone ? 'mb-2' : 'h-6'}`}>
        <Typography.Text strong>生成结果</Typography.Text>
        <CopyButton text={text} />
      </div>
      <div className='relative flex-1 min-h-0'>
        <pre
          className={`
            m-0 ${standalone ? 'p-4' : 'p-2'} h-full
            text-sm overflow-auto whitespace-pre-wrap leading-relaxed
            bg-(--ant-color-bg-elevated)
            border border-(--ant-color-border) ${standalone ? 'rounded-lg' : ''}
          `}
        >
          {text}
        </pre>
        {loading && (
          <div
            className={`
              absolute inset-0
              flex items-center justify-center
              bg-(--ant-color-bg-elevated)/60 backdrop-blur-[1px]
            `}
          >
            <Spin description={loadingDescription} />
          </div>
        )}
      </div>
    </>
  );
}
