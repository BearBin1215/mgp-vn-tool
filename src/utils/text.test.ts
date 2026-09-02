import { describe, expect, it } from 'vitest';
import type { PageInfo } from '@/api/moegirl';
import {
  buildJapaneseNameTemplate,
  extractBrand,
  extractJa,
  extractReleaseDate,
  generateExternalLinksWikitext,
  isNumeric,
  kataToHira,
  normalizePunctuation,
  resolveFamilyTemplate,
  resolveInputId,
  resolveInternalLink,
  resolveOptionalInternalLink,
  resolveTitle,
  wrapLj,
} from '@/utils/text';

/** 构造 PageInfo 测试数据 */
const makePageInfo = (overrides: Partial<PageInfo>): PageInfo => ({
  pageId: 1,
  title: '',
  isDisambiguation: false,
  categories: [],
  ...overrides,
});

describe('normalizePunctuation', () => {
  it('半角感叹号和问号转换为全角', () => {
    expect(normalizePunctuation('Attack! Really?')).toBe('Attack！ Really？');
  });

  it('已是全角时保持不变', () => {
    expect(normalizePunctuation('！？')).toBe('！？');
  });

  it('无标点时原样返回', () => {
    expect(normalizePunctuation('abc')).toBe('abc');
  });
});

describe('isNumeric', () => {
  it('纯数字', () => {
    expect(isNumeric('123')).toBe(true);
  });

  it('两侧空格会被裁剪', () => {
    expect(isNumeric(' 123 ')).toBe(true);
  });

  it('空串不为数字', () => {
    expect(isNumeric('')).toBe(false);
  });

  it('含字母、小数、负号无效', () => {
    expect(isNumeric('12a')).toBe(false);
    expect(isNumeric('1.5')).toBe(false);
    expect(isNumeric('-1')).toBe(false);
  });
});

describe('resolveInputId', () => {
  it('已选项优先于输入内容', () => {
    expect(resolveInputId('1', 'abc')).toBe('1');
  });

  it('输入为纯数字时直接作为 id', () => {
    expect(resolveInputId(null, '123')).toBe('123');
  });

  it('输入带空格时裁剪后判断', () => {
    expect(resolveInputId(null, ' 123 ')).toBe('123');
  });

  it('输入非数字时返回 null', () => {
    expect(resolveInputId(null, 'abc')).toBe(null);
  });

  it('输入为空时返回 null', () => {
    expect(resolveInputId(null, '')).toBe(null);
  });
});

describe('kataToHira', () => {
  it('片假名转换为平假名', () => {
    expect(kataToHira('カタカナ')).toBe('かたかな');
  });

  it('长音符等非转换范围内的字符保持不变', () => {
    expect(kataToHira('ラーメン')).toBe('らーめん');
  });

  it('平假名和汉字保持不变', () => {
    expect(kataToHira('漢字とひらがな')).toBe('漢字とひらがな');
  });
});

describe('buildJapaneseNameTemplate', () => {
  it('汉字姓+假名名时拆分为三段', () => {
    expect(buildJapaneseNameTemplate('天季ひより', 'アマキヒヨリ')).toBe('{{日本人名|天季|あまき|ひより}}');
  });

  it('名字以汉字结尾时使用基础形式', () => {
    expect(buildJapaneseNameTemplate('夏和小', 'カナコ')).toBe('{{日本人名|夏和小|かなこ}}');
  });

  it('全假名姓名使用基础形式', () => {
    expect(buildJapaneseNameTemplate('かわしまりの', 'カワシマリノ')).toBe('{{日本人名|かわしまりの|かわしまりの}}');
  });

  it('空姓名与空假名时使用空白模板', () => {
    expect(buildJapaneseNameTemplate('', '')).toBe('{{日本人名||}}');
  });
});

describe('wrapLj', () => {
  it('含平假名时包装为 lj 模板', () => {
    expect(wrapLj('何をしているの')).toBe('{{lj|何をしているの}}');
  });

  it('含片假名时包装为 lj 模板', () => {
    expect(wrapLj('オナニー')).toBe('{{lj|オナニー}}');
  });

  it('纯汉字不包装', () => {
    expect(wrapLj('漢字')).toBe('漢字');
  });

  it('包装时标点在模板内归一化', () => {
    expect(wrapLj('へんたい!')).toBe('{{lj|へんたい！}}');
  });
});

describe('generateExternalLinksWikitext', () => {
  it('全部字段为空时返回空串', () => {
    expect(generateExternalLinksWikitext({})).toBe('');
  });

  it('各非空字段各生成一行', () => {
    const text = generateExternalLinksWikitext({
      url: 'https://example.com',
      twitterUsername: 'user1',
      pixiv: '123',
      blog: 'https://blog.example.com',
    });
    expect(text).toBe([
      '* [https://example.com 个人主页]',
      '* [https://x.com/user1 X（原twitter）]',
      '* [https://www.pixiv.net/users/123 pixiv]',
      '* [https://blog.example.com 个人博客]',
    ].join('\n'));
  });
});

describe('resolveTitle', () => {
  const pageInfoMap = new Map([
    ['旧条目名', makePageInfo({ title: '新条目名', categories: ['有效分类'] })],
    ['不存在页面', makePageInfo({ title: '不存在页面', pageId: null })],
  ]);

  it('空标题返回空串', () => {
    expect(resolveTitle('', pageInfoMap)).toBe('');
  });

  it('命中时返回规范标题', () => {
    expect(resolveTitle('旧条目名', pageInfoMap)).toBe('新条目名');
  });

  it('页面不存在时返回原标题', () => {
    expect(resolveTitle('不存在页面', pageInfoMap)).toBe('不存在页面');
  });

  it('分类不匹配时返回原标题', () => {
    expect(resolveTitle('旧条目名', pageInfoMap, ['其他分类'])).toBe('旧条目名');
  });

  it('分类匹配时返回规范标题', () => {
    expect(resolveTitle('旧条目名', pageInfoMap, ['有效分类'])).toBe('新条目名');
  });

  it('无页面信息映射时返回原标题', () => {
    expect(resolveTitle('旧条目名', undefined)).toBe('旧条目名');
  });
});

describe('resolveInternalLink', () => {
  const pageInfoMap = new Map([
    ['旧条目名', makePageInfo({ title: '新条目名' })],
  ]);

  it('命中时返回规范标题内链', () => {
    expect(resolveInternalLink('旧条目名', pageInfoMap)).toBe('[[新条目名]]');
  });

  it('未命中时直接包内链', () => {
    expect(resolveInternalLink('其他', pageInfoMap)).toBe('[[其他]]');
  });

  it('空标题返回空串', () => {
    expect(resolveInternalLink('', pageInfoMap)).toBe('');
  });
});

describe('resolveOptionalInternalLink', () => {
  const pageInfoMap = new Map([
    ['存在页面', makePageInfo({ title: '存在页面条目名' })],
    ['不存在页面', makePageInfo({ title: '不存在页面', pageId: null })],
    ['指定分类内页面', makePageInfo({ title: '指定分类内页面名称', categories: ['有效分类'] })],
  ]);

  it('无页面信息映射时仅包装显示文本', () => {
    expect(resolveOptionalInternalLink('标题', undefined)).toBe('标题');
  });

  it('页面存在时返回内链', () => {
    expect(resolveOptionalInternalLink('存在页面', pageInfoMap)).toBe('[[存在页面条目名]]');
  });

  it('页面不存在时仅包装显示文本', () => {
    expect(resolveOptionalInternalLink('不存在页面', pageInfoMap)).toBe('不存在页面');
  });

  it('指定分类且不匹配时仅包装显示文本', () => {
    expect(resolveOptionalInternalLink('指定分类内页面', pageInfoMap, ['其他分类'])).toBe('指定分类内页面');
  });

  it('指定分类且匹配时返回内链', () => {
    expect(resolveOptionalInternalLink('指定分类内页面', pageInfoMap, ['有效分类'])).toBe('[[指定分类内页面名称]]');
  });
});

describe('resolveFamilyTemplate', () => {
  const pageInfoMap = new Map([
    ['Template:Key', makePageInfo({ title: 'Template:Key' })],
    ['Template:空页', makePageInfo({ title: 'Template:空页', pageId: null })],
  ]);

  it('模板存在时返回大家族模板', () => {
    expect(resolveFamilyTemplate('Key', pageInfoMap)).toBe('{{Key}}');
  });

  it('模板页面不存在时返回 null', () => {
    expect(resolveFamilyTemplate('空页', pageInfoMap)).toBe(null);
  });

  it('模板未查询时返回 null', () => {
    expect(resolveFamilyTemplate('Key', new Map())).toBe(null);
  });

  it('空名称返回 null', () => {
    expect(resolveFamilyTemplate('', pageInfoMap)).toBe(null);
  });
});

describe('extractReleaseDate', () => {
  it('匹配信息框发行时间并补零', () => {
    const wikitext = '{{Infobox\n|标题 = X\n|发行时间 = 2016年09月30日\n}}';
    expect(extractReleaseDate(wikitext)).toBe('2016-09-30');
  });

  it('匹配信息框中用于对齐位数的 {{0}} 占位', () => {
    expect(extractReleaseDate('{{Infobox\n|发行时间 = 2016年{{0}}8月30日\n}}')).toBe('2016-08-30');
    expect(extractReleaseDate('{{Infobox\n|发行时间 = 2016年12月{{0}}3日\n}}')).toBe('2016-12-03');
  });

  it('信息框存在多个时取首个', () => {
    const wikitext = '{{Infobox\n|发行时间 = 2016年9月30日\n}}\n{{Infobox\n|发行时间 = 2026年9月2日\n}}';
    expect(extractReleaseDate(wikitext)).toBe('2016-09-30');
  });

  it('无信息框时匹配正文发行、发售句式', () => {
    expect(extractReleaseDate('于2016年9月30日发售的游戏')).toBe('2016-09-30');
    expect(extractReleaseDate('于2016年1月2日发行')).toBe('2016-01-02');
  });

  it('繁体关键字同样匹配', () => {
    expect(extractReleaseDate('於2016年9月30日發售')).toBe('2016-09-30');
  });

  it('多版本发售日期取首个', () => {
    expect(extractReleaseDate('于2016年9月30日发售；主机版于2026年9月发售')).toBe('2016-09-30');
  });

  it('信息框优先于正文', () => {
    const wikitext = '{{Infobox\n|发行时间 = 2016年9月30日\n}}\n于2019年1月1日发售';
    expect(extractReleaseDate(wikitext)).toBe('2016-09-30');
  });

  it('无法提取时返回空串', () => {
    expect(extractReleaseDate('2016年发售')).toBe('');
  });
});

describe('extractJa', () => {
  it('匹配信息框原名纯文本', () => {
    expect(extractJa('{{Infobox\n|原名 = アマツツミ\n}}')).toBe('アマツツミ');
  });

  it('剥离信息框原名的 lj 模板包裹', () => {
    expect(extractJa('{{Infobox\n|原名 = {{lj|アマツツミ}}\n}}')).toBe('アマツツミ');
  });

  it('剥离信息框原名的 lang-ja 与加粗标记', () => {
    expect(extractJa("{{Infobox\n|原名 = {{lang-ja|'''アマツツミ'''}}\n}}")).toBe('アマツツミ');
  });

  it('剥离信息框原名的加粗标记', () => {
    expect(extractJa("{{Infobox\n|原名 = '''アマツツミ'''\n}}")).toBe('アマツツミ');
  });

  it('原名参数带首尾空白时裁剪', () => {
    expect(extractJa('{{Infobox\n|原名 =  アマツツミ  \n}}')).toBe('アマツツミ');
  });

  it('无信息框时匹配正文 lang-ja 模板', () => {
    expect(extractJa('（{{lang-ja|アマツツミ}}）')).toBe('アマツツミ');
  });

  it('信息框原名为空时兜底正文模板', () => {
    expect(extractJa('{{Infobox\n|原名 =\n}}\n{{lj|アマツツミ}}')).toBe('アマツツミ');
  });

  it('无法提取时返回空串', () => {
    expect(extractJa('没有日文原名')).toBe('');
  });
});

describe('extractBrand', () => {
  it('匹配信息框开发参数的内链', () => {
    expect(extractBrand('{{Infobox\n|开发 = [[Key]]\n}}')).toBe('Key');
  });

  it('信息框管道内链取页面名而非显示名', () => {
    expect(extractBrand('{{Infobox\n|开发 = [[Key|Key社]]\n}}')).toBe('Key');
  });

  it('匹配信息框开发纯文本', () => {
    expect(extractBrand('{{Infobox\n|开发 = Key\n}}')).toBe('Key');
  });

  it('信息框中 br 之后的内容被截断', () => {
    expect(extractBrand('{{Infobox\n|开发 = UGUISU KAGURA<br>Entergram\n}}')).toBe('UGUISU KAGURA');
    expect(extractBrand('{{Infobox\n|开发 = UGUISU KAGURA<br/>Entergram\n}}')).toBe('UGUISU KAGURA');
    expect(extractBrand('{{Infobox\n|开发 = UGUISU KAGURA<br />Entergram\n}}')).toBe('UGUISU KAGURA');
  });

  it('序言中 br 之后跨行的内容不参与匹配', () => {
    expect(extractBrand('由Purple software企划<br>\n由Entergram制作的游戏')).toBe('');
  });

  it('无信息框时匹配序言句式', () => {
    expect(extractBrand('由Key制作的恋爱游戏')).toBe('Key');
  });

  it('序言句式的内链被解析', () => {
    expect(extractBrand('由[[sprite]]开发的游戏')).toBe('sprite');
  });

  it('首个二级标题之后的句式不参与匹配', () => {
    const wikitext = '# 序言\n\n由Purple software制作\n\n== 简介 ==\n\n由Entergram制作';
    expect(extractBrand(wikitext)).toBe('Purple software');
  });

  it('无法提取时返回空串', () => {
    expect(extractBrand('没有制作组织信息')).toBe('');
  });
});
