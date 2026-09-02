import { describe, expect, it } from 'vitest';
import type { PageInfo } from '@/api/moegirl';
import type { GameRecord } from '@/api/erogamescape';
import { PENDING_SELL_DATE } from '@/utils/constants';
import {
  buildActingWikitext,
  buildConnectionsMap,
  generateMusicWikitable,
} from './generate-wikitext';

/** 构造出演/音乐记录测试数据 */
const makeRecord = (overrides: Partial<GameRecord>): GameRecord => ({
  shubetuDetail: '2',
  shubetuDetailName: '角色A',
  gameName: '作品A',
  sellDay: '2016-09-30',
  model: 'Windows',
  ...overrides,
});

/** 构造 PageInfo 测试数据 */
const makePageInfo = (overrides: Partial<PageInfo>): PageInfo => ({
  pageId: 1,
  title: '',
  isDisambiguation: false,
  categories: [],
  ...overrides,
});

describe('buildConnectionsMap', () => {
  it('按 subject 作品名归一化后分组', () => {
    const map = buildConnectionsMap([
      { kind: 'fandisk', subjectGameName: '作品B!', objectGameName: '作品A' },
      { kind: 'remake', subjectGameName: '作品B!', objectGameName: '作品C' },
    ]);
    expect(map.get('作品B！')).toHaveLength(2);
    expect(map.get('作品B!')).toBeUndefined();
  });
});

describe('buildActingWikitext 生成出演作品源代码', () => {
  it('空记录返回空串', () => {
    expect(buildActingWikitext([], new Map())).toBe('');
  });

  it('按年份分组并生成标题', () => {
    const text = buildActingWikitext(
      [makeRecord({ sellDay: '2016-09-30' })],
      new Map(),
    );
    expect(text).toBe("'''2016年'''\n* 角色A————《作品A》\n");
  });

  it('年份按字符串升序排列', () => {
    const text = buildActingWikitext(
      [
        makeRecord({ gameName: '作品B', sellDay: '2017-01-01', shubetuDetailName: '角色B' }),
        makeRecord({ gameName: '作品A', sellDay: '2015-01-01', shubetuDetailName: '角色A' }),
      ],
      new Map(),
    );
    expect(text.indexOf('2015年')).toBeLessThan(text.indexOf('2017年'));
  });

  it('待定发售日归入待定年份组', () => {
    const text = buildActingWikitext(
      [makeRecord({ sellDay: PENDING_SELL_DATE })],
      new Map(),
    );
    expect(text).toContain("'''待定'''");
  });

  it('含主要角色，仅首个加粗并提示人工确认', () => {
    const text = buildActingWikitext(
      [makeRecord({ shubetuDetail: '1', shubetuDetailName: '主角、配角' })],
      new Map(),
    );
    expect(text).toContain("* '''主角'''、配角————《作品A》");
    expect(text).toContain('<!-- 第二个角色是否为主要角色可能需要手动确认 -->');
  });

  it('全部为次要角色时不加粗也不提示确认', () => {
    const text = buildActingWikitext(
      [
        makeRecord({ shubetuDetail: '2', shubetuDetailName: '配角A' }),
        makeRecord({ shubetuDetail: '2', shubetuDetailName: '配角B' }),
      ],
      new Map(),
    );
    expect(text).toContain('* 配角A、配角B————《作品A》');
    expect(text).not.toContain("'''配角A");
    expect(text).not.toContain('可能需要手动确认');
  });

  it('同作品重复角色去重', () => {
    const text = buildActingWikitext(
      [
        makeRecord({ shubetuDetailName: '角色A' }),
        makeRecord({ shubetuDetailName: '角色A' }),
      ],
      new Map(),
    );
    expect(text.match(/角色A/g)).toHaveLength(1);
  });

  it('非 PC 平台显示括号标注', () => {
    const text = buildActingWikitext(
      [makeRecord({ model: 'NS' })],
      new Map(),
    );
    expect(text).toContain('* 角色A————《作品A》（NS）');
  });

  it('同角色同作品的多平台记录合并去重', () => {
    const text = buildActingWikitext(
      [
        makeRecord({ model: 'NS', shubetuDetailName: '角色A' }),
        makeRecord({ model: 'PS4', shubetuDetailName: '角色A' }),
      ],
      new Map(),
    );
    expect(text).toContain('* 角色A————《作品A》（NS、PS4）');
  });

  it('角色为消歧义页时行尾添加注释', () => {
    const pageInfoMap = new Map([['角色A', makePageInfo({ title: '角色A', isDisambiguation: true })]]);
    const text = buildActingWikitext(
      [makeRecord({ shubetuDetailName: '角色A' })],
      new Map(),
      pageInfoMap,
    );
    expect(text).toContain('<!-- 角色名链接是消歧义页 -->');
    expect(text).not.toContain('[[角色A]]');
  });

  it('角色属于角色分类页面时添加内链', () => {
    const pageInfoMap = new Map([
      ['角色A', makePageInfo({ title: '角色A条目名', categories: ['黑发'] })],
    ]);
    const text = buildActingWikitext(
      [makeRecord({ shubetuDetailName: '角色A' })],
      new Map(),
      pageInfoMap,
    );
    expect(text).toContain('* [[角色A条目名]]————《作品A》');
  });

  it('角色页面不属于角色分类时不加内链', () => {
    const pageInfoMap = new Map([
      ['角色A', makePageInfo({ title: '角色A条目名', categories: ['日本音乐作品'] })],
    ]);
    const text = buildActingWikitext(
      [makeRecord({ shubetuDetailName: '角色A' })],
      new Map(),
      pageInfoMap,
    );
    expect(text).toContain('* 角色A————《作品A》');
  });

  it('主要角色命中角色页时内链加粗', () => {
    const pageInfoMap = new Map([
      ['角色A', makePageInfo({ title: '角色A条目名', categories: ['金发'] })],
    ]);
    const text = buildActingWikitext(
      [makeRecord({ shubetuDetail: '1', shubetuDetailName: '角色A' })],
      new Map(),
      pageInfoMap,
    );
    expect(text).toContain("* '''[[角色A条目名]]'''————《作品A》");
  });

  it('作品无自身条目时通过关联回退到原作内链', () => {
    const gameMap = new Map([['作品A', '作品A条目']]);
    const connections = buildConnectionsMap([
      { kind: 'apend', subjectGameName: '作品B', objectGameName: '作品A' },
    ]);
    const text = buildActingWikitext(
      [makeRecord({ gameName: '作品B' })],
      gameMap,
      undefined,
      connections,
    );
    expect(text).toContain('————《[[作品A条目|作品B]]》');
  });
});

describe('generateMusicWikitable 生成音乐作品源代码', () => {
  it('空记录返回空串', () => {
    expect(generateMusicWikitable([], new Map())).toBe('');
  });

  it('基础表格结构', () => {
    const text = generateMusicWikitable(
      [makeRecord({ shubetuDetailName: '歌曲A', sellDay: '2016-09-30' })],
      new Map([['作品A', '作品A条目']]),
    );
    expect(text).toBe([
      '{| class="wikitable"',
      '|-',
      '! 标题 !! 时间 !! 备注',
      '|-',
      '| 歌曲A || 2016年9月30日 || 《[[作品A条目]]》',
      '|}',
    ].join('\n'));
  });

  it('无自身条目时通过关联回退到原作内链', () => {
    const gameMap = new Map([['作品A', '作品A条目']]);
    const connections = buildConnectionsMap([
      { kind: 'fandisk', subjectGameName: '作品B', objectGameName: '作品A' },
    ]);
    const text = generateMusicWikitable(
      [makeRecord({ gameName: '作品B' })],
      gameMap,
      connections,
    );
    expect(text).toContain('《[[作品A条目|作品B]]》');
  });

  it('待定发售日显示为待定', () => {
    const text = generateMusicWikitable(
      [makeRecord({ sellDay: PENDING_SELL_DATE })],
      new Map(),
    );
    expect(text).toContain('|| 待定 ||');
  });
});
