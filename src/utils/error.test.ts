import { describe, expect, it } from 'vitest';
import { formatError, isToolError } from '@/utils/error';

describe('formatError', () => {
  it('Error 实例取 message', () => {
    expect(formatError(new Error('boom'))).toBe('boom');
  });

  it('非 Error 值转为字符串', () => {
    expect(formatError(42)).toBe('42');
  });
});

describe('isToolError', () => {
  it('结构化错误返回 true', () => {
    expect(isToolError({ code: 'test', detail: '详情' })).toBe(true);
  });

  it('普通 Error 实例返回 false', () => {
    expect(isToolError(new Error('boom'))).toBe(false);
  });
});
