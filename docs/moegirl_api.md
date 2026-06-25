# 萌娘百科 API 使用文档

## 请求方式

通过 `src/api/moegirl.ts` 中封装的方法调用：

- `get(params)`：GET 请求，host 自动从设置读取
- `post(params)`：POST 请求，host 自动从设置读取
- `postWithToken(tokenType, params)`：先获取指定类型 token，再携带 token 发起 POST 请求，token 会在会话内缓存

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

// 查询条目的重定向和分类信息
// format/formatversion/utf8 由 Rust 后端自动添加，无需手动传入
const res = await moegirl.post({
  action: 'query',
  prop: ['redirects', 'categories'],
  titles: ['冥契的牧神节', '只愿'],
  redirects: '1', // 自动处理重定向
  rdprop: 'title',
  rdlimit: 'max',
  clshow: '!hidden', // 只显示非隐藏分类
  cllimit: 'max',
});
```

响应：
```json
{
  "batchcomplete": true,
  "query": {
    "redirects": [
      {
        "from": "只愿",
        "to": "破碎的祈愿"
      }
    ],
    "pages": [
      {
        "pageid": 434382,
        "ns": 0,
        "title": "冥契的牧神节",
        "redirects": [
          {
            "ns": 0,
            "title": "冥契のルペルカリア"
          }
        ],
        "categories": [
          {
            "ns": 14,
            "title": "Category:Nintendo Switch游戏"
          },
          {
            "ns": 14,
            "title": "Category:PlayStation 4游戏"
          },
          {
            "ns": 14,
            "title": "Category:UGUISU KAGURA作品"
          },
          {
            "ns": 14,
            "title": "Category:Windows游戏"
          },
          {
            "ns": 14,
            "title": "Category:冥契的牧神节"
          },
          {
            "ns": 14,
            "title": "Category:恋爱冒险游戏"
          },
          {
            "ns": 14,
            "title": "Category:戏剧题材"
          },
          {
            "ns": 14,
            "title": "Category:日本游戏作品"
          }
        ]
      },
      {
        "pageid": 646490,
        "ns": 0,
        "title": "破碎的祈愿",
        "redirects": [
          {
            "ns": 0,
            "title": "カタネガイ"
          },
          {
            "ns": 0,
            "title": "未竟的祈愿"
          },
          {
            "ns": 0,
            "title": "片方的祈愿"
          },
          {
            "ns": 0,
            "title": "只愿"
          }
        ],
        "categories": [
          {
            "ns": 14,
            "title": "Category:Windows游戏"
          },
          {
            "ns": 14,
            "title": "Category:兄妹题材"
          },
          {
            "ns": 14,
            "title": "Category:恋爱冒险游戏"
          },
          {
            "ns": 14,
            "title": "Category:日本游戏作品"
          },
          {
            "ns": 14,
            "title": "Category:破碎的祈愿"
          },
          {
            "ns": 14,
            "title": "Category:返乡题材"
          }
        ]
      }
    ]
  },
  "limits": {
    "redirects": 500,
    "categories": 500
  }
}
```

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
3. 多个 continue 字段可以同时出现，例如同时请求 `prop: ["redirects", "categories"]` 时，可能同时返回 `rdcontinue`、`clcontinue` 和 `continue`
4. 一般通过 `do {...} while (rules)` 来实现，先发起请求，以请求中有无 `continue` 判定是否继续循环执行;

### 示例

首次请求返回：
```json
{
  "continue": {
    "rdcontinue": "破碎的祈愿|646495",
    "clcontinue": "434382|PlayStation_4游戏",
    "continue": "||"
  },
  "query": { ... }
}
```

需要将 `continue` 中的所有字段作为参数发起下一次请求：
```jsonc
{
  "action": "query",
  "prop": ["redirects", "categories"],
  "titles": ["冥契的牧神节", "只愿"],
  "redirects": "1",
  "rdprop": "title",
  "rdlimit": "max",
  "clshow": "!hidden",
  "cllimit": "max",
  // 以下为 continue 字段，必须全部传入
  "rdcontinue": "破碎的祈愿|646495",
  "clcontinue": "434382|PlayStation_4游戏",
  "continue": "||"
}
```

当响应中不再包含 `continue` 时，表示所有数据已返回完毕。
