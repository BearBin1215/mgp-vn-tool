/**
 * 对 types-mediawiki-response 的萌百定制增广：
 * 萌娘百科在 list=users 响应中追加的扩展字段，MediaWiki 核心不含。
 * 引入本文件即对全项目生效，无需在各使用处单独导入。
 */
import type {} from 'types-mediawiki-response';

declare module 'types-mediawiki-response' {
  interface ApiUser {
    /** 显示昵称（萌百定制，未设置时为 null） */
    displayname?: string | null;
    /** 昵称标签（萌百定制，未设置时为 null） */
    displaytag?: string | null;
  }
}
