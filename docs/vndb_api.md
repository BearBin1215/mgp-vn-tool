# VNDB API 使用文档

本文档记录项目中用到的 VNDB API v2（Kana）接口。部分参数说明译自 [VNDB API 文档](https://api.vndb.org/kana)。

- [请求规范](#请求规范)
- [请求参数](#请求参数)
  - [filters 格式](#filters-格式)
  - [fields 格式](#fields-格式)
  - [响应结构](#响应结构)
  - [失败响应](#失败响应)
- [使用接口](#使用接口)
  - [制作组织信息](#制作组织信息)
  - [制作组织名称搜索](#制作组织名称搜索)
  - [会社作品列表](#会社作品列表)

## 请求规范

- 请求地址：`https://api.vndb.org/kana`
- 所有查询接口均为 POST 请求，Content-Type 为 `application/json`

## 请求参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `filters` | array/string | 过滤条件，决定查询范围 |
| `fields` | string | 逗号分隔的字段列表，指定返回哪些字段 |
| `results` | number | 每页返回条数，最大 100，默认 10 |
| `page` | number | 页码，从 1 开始 |
| `sort` | string | 排序字段，可选 |
| `reverse` | boolean | 是否降序，默认 false |

### filters 格式

- 简单过滤：`["字段名", "运算符", 值]`，运算符支持 `=`、`!=`、`>`、`<`、`>=`、`<=`。
- 嵌套过滤（关联查询）：`["关联字段", "=", ["子过滤字段", "=", 值]]`，如 `["developer", "=", ["id", "=", "p7001"]]`。
- 组合过滤：`["and"/"or", 过滤1, 过滤2, ...]`，支持多层嵌套。

### fields 格式

逗号分隔字段名，嵌套对象用点号或花括号：`"titles{lang,title,main}"` 等价于 `"titles.lang,titles.title,titles.main"`。顶层 `id` 字段默认返回，无需显式指定。

### 响应结构

```json
{
  "results": [],
  "more": false
}
```

`more=true` 时递增 `page` 继续请求即可获取后续数据。

### 失败响应

HTTP 400
```
Invalid 'id' filter: Invalid value.
```

## 使用接口

以下示例均以 CRYSTALiA / producer `p7001` 为例。

### 制作组织信息

`POST /producer`

返回符合条件的 producer 列表（`results[0]`）。本工具取 `results` 首项。

| 字段 | 类型 | 说明 | 本工具处理 |
| --- | --- | --- | --- |
| `id` | string | producer id（如 `p7001`） | 用作名称回退 |
| `name` | string | 名称（罗马音） | 优先用作会社名 |
| `original` | string \| null | 原文名 | name 缺失时回退；不为空且与 name 不同时插入别名首位 |
| `aliases` | string[] | 别名 | 合并入别名 |
| `description` | string \| null | 简介 | 去首尾空白后作为简介 |
| `extlinks` | array | 扩展链接，见下 | 提取官网/X/YouTube |
| `lang`/`type` 等 | - | 其余字段 | 本工具未使用 |

`extlinks` 每项为 `{ "label": string \| null, "url": string }`，`label` 可能为 null（项目用 `eq_ignore_ascii_case` 比较时 None 自动跳过）。本工具按 `label`（大小写不敏感）提取：
- `Official website` → 官网；
- `Xitter` → X（Twitter）；
- `Youtube` → YouTube。

请求体：

```json
{
  "filters": ["id", "=", "p7001"],
  "fields": "name,original,aliases,description,extlinks{url,label}",
  "results": 10
}
```

响应体（长链接已截断，仅保留代表性 extlinks）：

```json
{
  "more": false,
  "results": [
    {
      "id": "p7001",
      "name": "CRYSTALiA",
      "original": null,
      "aliases": ["水晶社"],
      "description": null,
      "extlinks": [
        { "label": "Official website", "url": "https://crystalia.amusecraft.com/" },
        { "label": "Xitter", "url": "https://x.com/CRYSTALiA_AC" },
        { "label": "Youtube", "url": "https://www.youtube.com/@crystalia3954" },
        { "label": "Wikipedia (ja)", "url": "https://ja.wikipedia.org/wiki/ソフパル" }
      ]
    }
  ]
}
```

### 制作组织名称搜索

`POST /producer`（同上端点，改用 `search` 过滤器）

`/producer` 端点的可用过滤器：`id`（按 id 精确查询）、`search`（按名称字符串搜索）、`lang`、`type`、`extlink`。本工具用 `search` 按名称模糊匹配，返回最多 10 项供前端下拉选择；`sort` 用 `searchrank`（搜索相关度排序，仅含 `search` 过滤器的端点可用）。

| 字段 | 类型 | 说明 | 本工具处理 |
| --- | --- | --- | --- |
| `id` | string | producer id（如 `p7001`） | 剥掉前缀 `p`，仅留数字供前端使用 |
| `name` | string | 名称（罗马音） | 优先用作展示名 |
| `original` | string \| null | 原文名 | name 缺失时回退；与 name 不同时附带展示 |
| `aliases` | string[] | 别名 | 本工具未使用（仅展示） |
| `type` | string | `co`会社 / `in`个人 / `ng`同人团体 | 转中文标签展示 |

请求体：

```json
{
  "filters": ["search", "=", "CRYSTALiA"],
  "fields": "id,name,original,aliases,type",
  "results": 10,
  "sort": "searchrank"
}
```

响应体结构同制作组织信息（`{ results, more }`），`results` 为匹配项数组。后端会过滤掉 `id` 或 `name` 为空的结果。

### 会社作品列表

`POST /vn`

使用 `developer` 过滤器关联 producer，返回该 producer 作为开发者的 VN 列表，支持分页。本工具以 `results=100` 分页拉取，直到 `more=false`。

| 字段 | 类型 | 说明 | 本工具处理 |
| --- | --- | --- | --- |
| `id` | string | VN id（如 `v21465`） | 用作原名回退；前端关联层级判定 |
| `olang` | string | 原始语言 | 取该语言的 `main` 标题作原名 |
| `released` | string \| null | 发售日 `YYYY-MM-DD` | 作为作品日期 |
| `titles` | array | 标题列表，见下 | 取原名与中文名 |
| `relations` | array | 关联列表，见下 | 关联层级判定（缩进） |

`titles` 每项为 `{ "lang": string, "title": string, "main": boolean }`。本工具提取：
- 原名：`lang` 等于 `olang` 且 `main=true` 的标题（回退到 `olang` 首个，再回退 VN id）；
- 中文名：`zh-Hans` 或 `zh-Hant` 首个，且与原名不同。

`relations` 每项为 `{ "relation": string, "id": string }`。后端原样透传所有 relations，前端仅用 `orig`（原作）触发衍生作品缩进；`preq`/`seq`/`set`/`fan` 等为平级或反向关系，不触发缩进。

> 注意：同一 VN 可能有多个 release（初回版、体验版等），直接查询 VN 可避免重复。

请求体：

```json
{
  "filters": ["developer", "=", ["id", "=", "p7001"]],
  "fields": "id,released,olang,titles.lang,titles.title,titles.main,relations.relation,relations.id",
  "results": 100,
  "page": 1
}
```

响应体（仅保留单个代表性 VN）：

```json
{
  "more": false,
  "results": [
    {
      "id": "v21465",
      "olang": "ja",
      "released": "2017-11-24",
      "titles": [
        { "lang": "ja", "title": "絆きらめく恋いろは", "main": true },
        { "lang": "zh-Hans", "title": "牵绊闪耀的恋之伊吕波", "main": false }
      ],
      "relations": [
        { "relation": "seq", "id": "v32269" }
      ]
    }
  ]
}
```
