import { describe, expect, it } from 'vitest';
import type { Article } from '@/stores/article-store';
import { buildGameArticleMap } from '@/utils/article-map';

/** 构造条目测试数据 */
const makeArticle = (overrides: Partial<Article>): Article => ({
  ja: '',
  title: '',
  brand: '',
  releaseDate: '',
  creationDate: '',
  categories: [],
  ...overrides,
});

describe('buildGameArticleMap', () => {
  it('空列表返回空映射', () => {
    expect(buildGameArticleMap([]).size).toBe(0);
  });

  it('原名与条目名都作为键指向条目', () => {
    const map = buildGameArticleMap([makeArticle({ ja: 'ゲームA', title: '游戏A' })]);
    expect(map.get('ゲームA')).toBe('游戏A');
    expect(map.get('游戏A')).toBe('游戏A');
  });

  it('重定向列表各键都指向条目', () => {
    const map = buildGameArticleMap([makeArticle({
      ja: 'ゲームA',
      title: '游戏A',
      redirects: ['A的旧名', 'A的别名'],
    })]);
    expect(map.get('A的旧名')).toBe('游戏A');
    expect(map.get('A的别名')).toBe('游戏A');
  });

  it('重定向页自身不进入映射', () => {
    const map = buildGameArticleMap([makeArticle({
      ja: '重定向页',
      title: '重定向页',
      redirect: '游戏A',
    })]);
    expect(map.size).toBe(0);
  });

  it('键经过标点归一化', () => {
    const map = buildGameArticleMap([makeArticle({ ja: 'ゲーム!', title: '游戏!' })]);
    expect(map.has('游戏！')).toBe(true);
    expect(map.has('ゲーム!')).toBe(false);
  });
});
