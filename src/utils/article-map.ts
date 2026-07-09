import type { Article } from '@/stores/article-store';
import { normalizePunctuation } from '@/utils/text';

/**
 * 构建批评空间游戏名到条目名的映射
 *
 * 跳过重定向页，以原名(ja)、条目名(title)及各重定向名为键，指向条目标题。
 * 键经 normalizePunctuation 归一化，供作品名内链解析使用。
 */
export const buildGameArticleMap = (articles: Article[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const a of articles) {
    if (a.redirect) {
      continue;
    }
    const normJa = normalizePunctuation(a.ja);
    const normTitle = normalizePunctuation(a.title);
    map.set(normJa, a.title);
    map.set(normTitle, a.title);
    for (const r of a.redirects || []) {
      map.set(normalizePunctuation(r), a.title);
    }
  }
  return map;
};
