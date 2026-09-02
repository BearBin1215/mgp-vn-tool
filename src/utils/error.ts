import i18next from 'i18next';

/** 结构化错误（与 Rust `ToolError` 对应，前端本地错误也复用此格式） */
export interface ToolErrorShape {
  /** 稳定错误码，前端按 `error.{code}` 查翻译表 */
  code: string;
  /** 插值参数，原样嵌入翻译模板 */
  params?: Record<string, unknown>;
  /** 简体原文，未收录错误码时的兜底展示 */
  detail: string;
}

/** 判断未知异常是否为结构化错误 */
export const isToolError = (e: unknown): e is ToolErrorShape =>
  typeof e === 'object' && e !== null
  && typeof (e as ToolErrorShape).code === 'string'
  && typeof (e as ToolErrorShape).detail === 'string';

/**
 * 构造可由 {@link formatError} 按当前界面语言格式化的前端本地错误
 * @param code 稳定错误码，对应语言包中的 `error.{code}`
 * @param detail 简体原文，翻译缺失时用于兜底展示
 * @param params 翻译模板所需的插值参数
 */
export const createLocalizedError = (
  code: string,
  detail: string,
  params?: Record<string, unknown>,
): ToolErrorShape => ({ code, params, detail });

/** 将任意值格式化为可读的错误信息字符串 */
export const formatError = (e: unknown): string => {
  if (isToolError(e)) {
    const key = `error.${e.code}`;
    const translated = i18next.t(key, { ...(e.params ?? {}) });
    // 未收录的错误码（简体语言包为空、或后端新增错误）回退展示简体原文
    return translated === key ? e.detail : translated;
  }
  return e instanceof Error ? e.message : String(e);
};
