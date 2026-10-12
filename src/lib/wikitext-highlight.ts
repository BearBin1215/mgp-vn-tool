import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

/** wikitext 高亮器单例的创建 Promise：首次调用时才动态加载语法与主题 */
let highlighterPromise: Promise<HighlighterCore> | null = null;

/**
 * 获取共享的 wikitext 高亮器
 *
 * 惰性创建模块级单例：语法与主题按需动态 import（仅生成结果区首次展示时加载，
 * 不影响首屏），三个条目生成页共用同一实例。使用 JS 正则引擎以避免引入
 * Oniguruma WASM。
 */
const getWikitextHighlighter = (): Promise<HighlighterCore> => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      langs: [import('shiki/langs/wikitext.mjs')],
      themes: [
        import('shiki/themes/github-light.mjs'),
        import('shiki/themes/github-dark.mjs'),
      ],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
};

/**
 * 渲染 wikitext 高亮 HTML
 *
 * 采用双主题（github-light / github-dark）+ `defaultColor: false` 模式：每个
 * token span 只携带 `--shiki-light` / `--shiki-dark` CSS 变量，颜色值不固定
 * 在输出里，实际显示颜色由 App.css 中 `.wikitext-highlight` 规则随应用
 * 明暗主题切换。
 *
 * 返回 `<code>` 元素的内部内容，不含 Shiki 外层 `<pre>`（其自带的背景色
 * 内联样式会与面板自身的容器样式冲突）。文本中的标签在输出中已被转义为
 * 字符实体，因此截取正则只会匹配到 Shiki 自己输出的 `<code>` 标签。
 *
 * @param highlighter 已就绪的高亮器实例
 * @param text wikitext 原文
 * @returns 可注入 `<code>` 的 HTML 字符串，text 为空时返回空字符串
 */
const renderWikitext = (highlighter: HighlighterCore, text: string): string => {
  if (!text) {
    return '';
  }
  const html = highlighter.codeToHtml(text, {
    lang: 'wikitext',
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
  });
  return html
    .replace(/^[\s\S]*?<code[^>]*>/, '')
    .replace(/<\/code><\/pre>$/, '');
};

/** 面向使用方暴露的高亮器类型：组件只依赖此别名，不直接依赖 shiki 包路径 */
export type WikitextHighlighter = HighlighterCore;

export { getWikitextHighlighter, renderWikitext };
