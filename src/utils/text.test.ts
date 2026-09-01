import { describe, expect, it } from 'vitest';
import type { PageInfo } from '@/api/moegirl';
import {
  buildJapaneseNameTemplate,
  extractBrand,
  extractJa,
  extractReleaseDate,
  formatDateCN,
  formatError,
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
    expect(wrapLj('ひな!')).toBe('{{lj|ひな！}}');
  });

  it('无假名时仅归一化标点', () => {
    expect(wrapLj('Attack!')).toBe('Attack！');
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
    ['旧名', makePageInfo({ title: '新名', categories: ['有效分类'] })],
    ['不存在页', makePageInfo({ title: '不存在页', pageId: null })],
  ]);

  it('空标题返回空串', () => {
    expect(resolveTitle('', pageInfoMap)).toBe('');
  });

  it('命中时返回规范标题', () => {
    expect(resolveTitle('旧名', pageInfoMap)).toBe('新名');
  });

  it('页面不存在时返回原标题', () => {
    expect(resolveTitle('不存在页', pageInfoMap)).toBe('不存在页');
  });

  it('分类不匹配时返回原标题', () => {
    expect(resolveTitle('旧名', pageInfoMap, ['其他分类'])).toBe('旧名');
  });

  it('分类匹配时返回规范标题', () => {
    expect(resolveTitle('旧名', pageInfoMap, ['有效分类'])).toBe('新名');
  });

  it('无页面信息映射时返回原标题', () => {
    expect(resolveTitle('旧名', undefined)).toBe('旧名');
  });
});

describe('resolveInternalLink', () => {
  const pageInfoMap = new Map([
    ['旧名', makePageInfo({ title: '新名' })],
  ]);

  it('命中时返回规范标题内链', () => {
    expect(resolveInternalLink('旧名', pageInfoMap)).toBe('[[新名]]');
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
    ['存在页', makePageInfo({ title: '存在页规范名' })],
    ['不存在页', makePageInfo({ title: '不存在页', pageId: null })],
    ['分类页', makePageInfo({ title: '分类页规范名', categories: ['有效分类'] })],
  ]);

  it('无页面信息映射时仅包装显示文本', () => {
    expect(resolveOptionalInternalLink('标题', undefined)).toBe('标题');
  });

  it('页面存在时返回内链', () => {
    expect(resolveOptionalInternalLink('存在页', pageInfoMap)).toBe('[[存在页规范名]]');
  });

  it('页面不存在时仅包装显示文本', () => {
    expect(resolveOptionalInternalLink('不存在页', pageInfoMap)).toBe('不存在页');
  });

  it('指定分类且不匹配时仅包装显示文本', () => {
    expect(resolveOptionalInternalLink('分类页', pageInfoMap, ['其他分类'])).toBe('分类页');
  });

  it('指定分类且匹配时返回内链', () => {
    expect(resolveOptionalInternalLink('分类页', pageInfoMap, ['有效分类'])).toBe('[[分类页规范名]]');
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

describe('formatDateCN', () => {
  it('空值返回空串', () => {
    expect(formatDateCN(null)).toBe('');
    expect(formatDateCN('')).toBe('');
  });

  it('有效日期格式化为中文', () => {
    expect(formatDateCN('2016-09-30')).toBe('2016年9月30日');
  });

  it('无效日期原样返回', () => {
    expect(formatDateCN('not-a-date')).toBe('not-a-date');
  });
});

describe('formatError', () => {
  it('Error 实例取 message', () => {
    expect(formatError(new Error('boom'))).toBe('boom');
  });

  it('非 Error 值转为字符串', () => {
    expect(formatError(42)).toBe('42');
  });
});

describe('extractReleaseDate', () => {
  it('匹配信息框发行时间并补零', () => {
    const wikitext = '{{Infobox\n|标题 = X\n|发行时间 = 2016年09月30日\n}}';
    expect(extractReleaseDate(wikitext)).toBe('2016-09-30');
  });

  it('信息框存在多个时取首个', () => {
    const wikitext = '{{Infobox\n|发行时间 = 2016年9月30日\n}}\n{{Infobox\n|发行时间 = 2019年1月1日\n}}';
    expect(extractReleaseDate(wikitext)).toBe('2016-09-30');
  });

  it('无信息框时匹配正文发行、发售句式', () => {
    expect(extractReleaseDate('于2016年9月30日发售的游戏')).toBe('2016-09-30');
    expect(extractReleaseDate('于2016年1月2日发行')).toBe('2016-01-02');
  });

  it('繁体关键字同样匹配', () => {
    expect(extractReleaseDate('於2016年9月30日發售')).toBe('2016-09-30');
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
    expect(extractJa('{{Infobox\n|原名 = ひなたぼっこ\n}}')).toBe('ひなたぼっこ');
  });

  it('剥离信息框原名的 lj 模板包裹', () => {
    expect(extractJa('{{Infobox\n|原名 = {{lj|ひなたぼっこ}}\n}}')).toBe('ひなたぼっこ');
  });

  it('剥离信息框原名的 lang-ja 与加粗标记', () => {
    expect(extractJa('{{Infobox\n|原名 = {{lang-ja|\'\'\'ひなたぼっこ\'\'\'}}\n}}')).toBe('ひなたぼっこ');
  });

  it('剥离信息框原名的加粗标记', () => {
    expect(extractJa('{{Infobox\n|原名 = \'\'\'ひな\'\'\'\n}}')).toBe('ひな');
  });

  it('原名参数带首尾空白时裁剪', () => {
    expect(extractJa('{{Infobox\n|原名 =  ひな  \n}}')).toBe('ひな');
  });

  it('无信息框时匹配正文 lang-ja 模板', () => {
    expect(extractJa('这是正文\n{{lang-ja|ひな}}\n后续')).toBe('ひな');
  });

  it('信息框原名为空时兜底正文模板', () => {
    expect(extractJa('{{Infobox\n|原名 =\n}}\n{{lj|ひな}}')).toBe('ひな');
  });

  it('无法提取时返回空串', () => {
    expect(extractJa('没有日文原名')).toBe('');
  });
});

describe('extractBrand', () => {
  it('匹配信息框开发的内链', () => {
    expect(extractBrand('{{Infobox\n|开发 = [[Key]]\n}}')).toBe('Key');
  });

  it('信息框管道内链取页面名而非显示名', () => {
    expect(extractBrand('{{Infobox\n|开发 = [[Key|Key社]]\n}}')).toBe('Key');
  });

  it('匹配信息框开发纯文本', () => {
    expect(extractBrand('{{Infobox\n|开发 = Key\n}}')).toBe('Key');
  });

  it('信息框中 br 之后的内容被截断', () => {
    expect(extractBrand('{{Infobox\n|开发 = Key<br>Sprite\n}}')).toBe('Key');
  });

  it('无信息框时匹配序言句式', () => {
    expect(extractBrand('由Key制作的恋爱游戏')).toBe('Key');
  });

  it('序言句式的内链被解析', () => {
    expect(extractBrand('由[[Sprite]]开发的游戏')).toBe('Sprite');
  });

  it('首个二级标题之后的句式不参与匹配', () => {
    const wikitext = '# 序言\n\n由Key制作\n\n== 简介 ==\n\n由Sprite制作';
    expect(extractBrand(wikitext)).toBe('Key');
  });

  it('信息框位于二级标题之后时不参与匹配', () => {
    const wikitext = '由X社制作\n\n== 简介 ==\n{{Infobox\n|开发 = Key\n}}';
    expect(extractBrand(wikitext)).toBe('X社');
  });

  it('无法提取时返回空串', () => {
    expect(extractBrand('没有制作组织信息')).toBe('');
  });
});
