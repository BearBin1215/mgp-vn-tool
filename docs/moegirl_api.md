# 萌娘百科 API 使用文档

- [持久化设置项](#持久化设置项)
- [请求方式](#请求方式)
- [自动添加的参数](#自动添加的参数)
- [请求示例](#请求示例)
- [continue 分页机制](#continue-分页机制)
  - [continue 字段与 prop 的对应关系](#continue-字段与-prop-的对应关系)
  - [处理规则](#处理规则)
  - [示例](#示例)


## 持久化设置项

设置项存储在 Tauri Store 的 `settings.json` 中，由前端 `useSettingsStore` 写入、后端 `moegirl_request` 读取。

| Store Key | 类型 | 默认值 | 说明 |
|-----------|------|--------|------|
| `moegirlApiHost` | `mzh.moegirl.org.cn` \| `zh.moegirl.org.cn` | `mzh.moegirl.org.cn` | 萌娘百科 API 域名前缀 |
| `moegirlJumpHost` | 同上 \| `'same'` | `'same'` | 萌娘百科跳转域名前缀，`'same'` 表示与请求域名一致 |
| `moegirlUserAgent` | string | `DEFAULT_USER_AGENT` | 萌娘百科请求 User-Agent |
| `moegirlRetries` | number | `1` | 请求失败重试次数 |
| `moegirlRetryDelay` | number | `1000` | 请求失败重试间隔（毫秒） |
| `moegirlUsername` | string | `''` | 当前登录用户名（未登录为空，由 `moegirl_check_login` 初始化） |

> Cookie 通过系统凭据存储（keyring）持久化，service 名 `com.bearbin.mgp-vn-tool`，entry 名 `moegirl-cookies`。萌百各子站点（mzh./zh.）共用同一套 cookie，`Domain=moegirl.org.cn` 的 cookie 会自动携带到所有子域。

## 请求方式

通过 `src/api/moegirl.ts` 中封装的方法调用：

- `get(params)`：GET 请求，host 自动从设置读取
- `post(params)`：POST 请求，host 自动从设置读取
- `getToken(tokenType)`：获取指定类型 token，优先使用会话内缓存
- `postWithToken(tokenType, params)`：先获取指定类型 token，再携带 token 发起 POST 请求，token 会在会话内缓存
- `checkLogin()`：检查登录状态
- `getUserRights()`：获取当前用户的 groups、rights 与显示昵称
- `logout()`：退出登录，清空 token 缓存与 cookie

`postWithToken` 的 tokenField 细节：`tokenType === 'login'` 时字段名为 `logintoken`，其他类型为 `token`。

涉及较多数据的请求（如批量查询分类）使用 POST 而非 GET，以避免出现 413（请求体过大）错误。

## 自动添加的参数

以下参数由 Rust 后端自动添加，调用时**无需手动传入**：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `format` | `"json"` | 不传时自动补为 `json` |
| `formatversion` | `"2"` | format 为 json 时自动添加 |
| `utf8` | `"1"` | format 为 json 时自动添加 |

## 请求示例

```typescript
import moegirl from '@/api/moegirl';

// 批量查询条目的页面信息与分类（fetchPageInfo 的单批次请求）
// format/formatversion/utf8 由 Rust 后端自动添加，无需手动传入
const res = await moegirl.post({
  action: 'query',
  prop: ['info', 'categories'],
  titles: ['冥契的牧神节', '只愿'],
  redirects: '1',          // 自动处理重定向
  converttitles: '1',      // 自动处理繁简转换
  clshow: '!hidden',       // 只显示非隐藏分类
  cllimit: 'max',
});
```

响应：
```json
{
  "batchcomplete": true,
  "query": {
    "redirects": [
      { "from": "只愿", "to": "破碎的祈愿" }
    ],
    "converted": [
      { "from": "冥契的牧神节", "to": "冥契的牧神节" }
    ],
    "pages": [
      {
        "pageid": 434382,
        "ns": 0,
        "title": "冥契的牧神节",
        "categories": [
          { "ns": 14, "title": "Category:Windows游戏" },
          { "ns": 14, "title": "Category:UGUISU KAGURA作品" },
          { "ns": 14, "title": "Category:冥契的牧神节" }
        ]
      }
    ]
  },
  "limits": { "categories": 500 }
}
```

> 顶层 `redirects` 与 `converted` 仅在请求中带 `redirects`/`converttitles` 时出现，分别记录重定向与繁简转换的 `from → to` 映射。

## continue 分页机制

当单次请求返回的数据超过 `limit` 限制时，响应中会额外返回 `continue` 对象，表示还有更多数据未返回。只要响应中存在 `continue`，就需要继续发起请求获取剩余数据。

### continue 字段与 prop 的对应关系

`continue` 中的字段取决于请求的 `prop` 参数，不同的 `prop` 会产生不同的 continue 字段：

| prop | continue 字段 | 说明 |
|------|--------------|------|
| `categories` | `clcontinue` | 分类数据未返回完 |
| `redirects` | `rdcontinue` | 页面重定向列表未返回完 |
| 任意 prop | `continue` | 通用分页 token |

### 处理规则

1. **只要有 `continue` 就要继续请求**，直到响应中不再出现 `continue` 为止
2. **`continue` 中所有字段都要原样作为请求参数传入**，缺一不可
3. 多个 `continue` 字段可以同时出现，例如同时请求 `prop: ["redirects", "categories"]` 时，可能同时返回 `rdcontinue`、`clcontinue` 和 `continue`
4. 一般通过 `do {...} while (rules)` 来实现，先发起请求，以请求中有无 `continue` 判定是否继续循环执行

### 示例

以 `fetchPageInfo` 的实际请求为例（`prop: ['info', 'categories']`），首次请求返回：

```json
{
  "continue": {
    "clcontinue": "434382|PlayStation_4游戏",
    "continue": "||"
  },
  "query": { "...": "..." }
}
```

需要将 `continue` 中的所有字段作为参数发起下一次请求：

```jsonc
{
  "action": "query",
  "prop": ["info", "categories"],
  "titles": ["冥契的牧神节", "只愿"],
  "redirects": "1",
  "converttitles": "1",
  "clshow": "!hidden",
  "cllimit": "max",
  // 以下为 continue 字段，必须全部传入
  "clcontinue": "434382|PlayStation_4游戏",
  "continue": "||"
}
```

当响应中不再包含 `continue` 时，表示所有数据已返回完毕。
