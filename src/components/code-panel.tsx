import { memo, useEffect, useMemo, useState } from 'react';
import { Spin, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import CopyButton from '@/components/copy-button';
import { getWikitextHighlighter, renderWikitext, type WikitextHighlighter } from '@/lib/wikitext-highlight';

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
 *
 * 代码区通过 Shiki 做 wikitext 语法高亮（双主题 CSS 变量，见
 * `lib/wikitext-highlight`）。高亮器为异步加载的单例：就绪前面板降级为纯文本，
 * 就绪后整段切换为高亮渲染；生成期间文本多次整体替换，重新高亮的开销可以忽略。
 */
const CodePanel = memo(({ text, loading, loadingDescription, variant = 'inset' }: CodePanelProps) => {
  const standalone = variant === 'standalone';
  const { t } = useTranslation();

  // wikitext 高亮器单例：就绪后触发一次重渲染，此后所有面板实例共享
  const [highlighter, setHighlighter] = useState<WikitextHighlighter | null>(null);
  useEffect(() => {
    let mounted = true;
    getWikitextHighlighter()
      .then((instance) => {
        if (mounted) {
          setHighlighter(instance);
        }
      })
      // 加载失败时保持纯文本展示，高亮属于增强能力，不中断生成功能
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // 高亮渲染结果：高亮器就绪且文本非空时产出，文本变化时重算
  const highlightedHtml = useMemo(
    () => (highlighter ? renderWikitext(highlighter, text) : ''),
    [highlighter, text],
  );

  return (
    <>
      <div className={`flex items-center justify-between shrink-0 px-1 ${standalone ? 'mb-2' : 'h-6'}`}>
        <Typography.Text strong>{t('生成结果')}</Typography.Text>
        <CopyButton text={text} />
      </div>
      <div className='relative flex-1 min-h-0'>
        <pre
          className={`
            m-0 ${standalone ? 'p-4' : 'p-2'} h-full
            text-sm overflow-auto whitespace-pre-wrap leading-relaxed
            bg-(--ant-color-bg-elevated)
            border border-(--ant-color-border) ${standalone ? 'rounded-lg' : ''}
            wikitext-highlight
          `}
        >
          {highlightedHtml
            ? <code dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
            : text}
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
});

export default CodePanel;
