import { describe, expect, it } from 'vitest';
import { unwrap, type ErogamescapeResponse } from '@/api/erogamescape';

/** 捕获 unwrap 抛出的值；失败提示可能是结构化错误而非 Error 实例，无法用 toThrow 匹配文案 */
const catchUnwrapError = (res: ErogamescapeResponse<unknown>): unknown => {
  try {
    unwrap(res);
    return null;
  } catch (e) {
    return e;
  }
};

describe('unwrap', () => {
  it('成功时返回 response', () => {
    const res: ErogamescapeResponse<string> = { statusCode: '200', result: 'success', response: 'data' };
    expect(unwrap(res)).toBe('data');
  });

  it('失败时抛出 response 内容', () => {
    const res: ErogamescapeResponse<string> = { statusCode: '500', result: 'fail', response: '数据库错误' };
    expect(() => unwrap(res)).toThrow('数据库错误');
  });

  it('失败且 response 为空串时使用默认提示', () => {
    const res: ErogamescapeResponse<string> = { statusCode: '0', result: 'fail', response: '' };
    expect(catchUnwrapError(res)).toEqual({ code: 'ero_unknown_failure', detail: '批评空间请求失败' });
  });

  it('失败且 response 为 null 时使用默认提示', () => {
    const res: ErogamescapeResponse<null> = { statusCode: '0', result: 'fail', response: null };
    expect(catchUnwrapError(res)).toEqual({ code: 'ero_unknown_failure', detail: '批评空间请求失败' });
  });

  it('失败且 response 为对象时转为字符串提示', () => {
    const res: ErogamescapeResponse<object> = { statusCode: '0', result: 'fail', response: {} };
    expect(() => unwrap(res)).toThrow('[object Object]');
  });

  it('失败且 response 为结构化错误时原样抛出', () => {
    const res: ErogamescapeResponse<string> = {
      statusCode: '0',
      result: 'fail',
      response: { code: 'ero_sql_unsupported', detail: '镜像站不支持sql查询' },
    };
    expect(catchUnwrapError(res)).toEqual({ code: 'ero_sql_unsupported', detail: '镜像站不支持sql查询' });
  });
});
