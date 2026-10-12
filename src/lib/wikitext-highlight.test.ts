import { describe, expect, it } from 'vitest';
import { getWikitextHighlighter, renderWikitext } from './wikitext-highlight';

describe('renderWikitext', () => {
  it('空文本返回空字符串', async () => {
    const highlighter = await getWikitextHighlighter();
    expect(renderWikitext(highlighter, '')).toBe('');
  });

  it('生成携带双主题 CSS 变量的高亮 HTML', async () => {
    const highlighter = await getWikitextHighlighter();
    const html = renderWikitext(highlighter, '{{Video Game Infobox\n|类型 = [[ADV]]\n}}');
    // 双主题模式下每个 token span 应同时携带两套颜色变量，供明暗主题切换
    expect(html).toContain('--shiki-light:');
    expect(html).toContain('--shiki-dark:');
    // 模板名与内链目标被切分为独立 token
    expect(html).toContain('>Video Game Infobox<');
    expect(html).toContain('>ADV<');
  });

  it('仅返回 code 内部内容，不残留 pre/code 标签', async () => {
    const highlighter = await getWikitextHighlighter();
    // 单行与多行都需去掉 Shiki 外层标签，否则注入后会破坏面板自身的 pre 结构
    for (const text of ['A<br>B', '{{T\n|a = [[b]]\n}}']) {
      const html = renderWikitext(highlighter, text);
      expect(html).not.toMatch(/<\/?(pre|code)[\s>]/);
    }
  });

  it('保留逐行结构与行间换行符', async () => {
    const highlighter = await getWikitextHighlighter();
    const text = '{{T\n|a = 1\n}}\n\n正文';
    const html = renderWikitext(highlighter, text);
    // 行数与 .line span 一一对应，行间保留真实换行符（面板的软换行依赖它们）
    expect(html.match(/class="line"/g)).toHaveLength(5);
    expect(html.match(/\n/g)).toHaveLength(4);
  });

  it('转义文本中的 HTML 标签，防止注入破坏 DOM', async () => {
    const highlighter = await getWikitextHighlighter();
    const html = renderWikitext(highlighter, 'A<br>B <!-- 注释 -->');
    expect(html).not.toContain('<br>');
    expect(html).not.toContain('<!--');
    expect(html).toContain('&#x3C;br>');
  });

  it('粗体语法输出双主题 font-weight 变量', async () => {
    const highlighter = await getWikitextHighlighter();
    const html = renderWikitext(highlighter, "{{lang-ja|'''テスト'''}}");
    expect(html).toContain('--shiki-light-font-weight:bold');
    expect(html).toContain('--shiki-dark-font-weight:bold');
  });
});
