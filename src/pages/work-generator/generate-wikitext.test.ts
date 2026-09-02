import { describe, expect, it } from 'vitest';
import { parseMusicStaffName, parseStaffName } from './generate-wikitext';

describe('parseStaffName', () => {
  it('拆分主名与别名', () => {
    expect(parseStaffName('A(B)')).toEqual({ main: 'A', alias: 'B' });
  });

  it('别名内含顿号时整体作为别名', () => {
    expect(parseStaffName('A(B、C)')).toEqual({ main: 'A', alias: 'B、C' });
  });

  it('无括号时仅返回主名', () => {
    expect(parseStaffName('A')).toEqual({ main: 'A', alias: '' });
  });

  it('主名两侧空白被裁剪', () => {
    expect(parseStaffName(' A ')).toEqual({ main: 'A', alias: '' });
  });

  it('括号后仍有内容时整体作为主名', () => {
    expect(parseStaffName('A(B)C')).toEqual({ main: 'A(B)C', alias: '' });
  });

  it('整体括号时直接作为主名', () => {
    expect(parseStaffName('(B)')).toEqual({ main: '(B)', alias: '' });
  });

  it('全角括号不参与拆分', () => {
    expect(parseStaffName('A（B）')).toEqual({ main: 'A（B）', alias: '' });
  });
});

describe('parseMusicStaffName', () => {
  it('标准分类 OP曲 解析为片头曲', () => {
    expect(parseMusicStaffName('OP曲「某歌曲名」')).toEqual({ categoryLabel: '片头曲', songName: '某歌曲名' });
  });

  it('标准分类 ED曲 解析为片尾曲', () => {
    expect(parseMusicStaffName('ED曲「某歌曲名」')).toEqual({ categoryLabel: '片尾曲', songName: '某歌曲名' });
  });

  it('标准分类挿入歌解析为插曲', () => {
    expect(parseMusicStaffName('挿入歌「某歌曲名」')).toEqual({ categoryLabel: '插曲', songName: '某歌曲名' });
  });

  it('标准分类キャラソン解析为角色歌', () => {
    expect(parseMusicStaffName('キャラソン「某歌曲名」')).toEqual({ categoryLabel: '角色歌', songName: '某歌曲名' });
  });

  it('带角色名前缀时保留为分类标签', () => {
    expect(parseMusicStaffName('ヒロインED「某歌曲名」')).toEqual({ categoryLabel: 'ヒロインED', songName: '某歌曲名' });
  });

  it('未知分类原样作为标签', () => {
    expect(parseMusicStaffName('主題歌「某歌曲名」')).toEqual({ categoryLabel: '主題歌', songName: '某歌曲名' });
  });

  it('无「」时整体作为曲名且标签为空', () => {
    expect(parseMusicStaffName('某歌曲名')).toEqual({ categoryLabel: '', songName: '某歌曲名' });
  });

  it('以「」开头但无前缀时整体作为曲名', () => {
    expect(parseMusicStaffName('「某歌曲名」')).toEqual({ categoryLabel: '', songName: '「某歌曲名」' });
  });
});
