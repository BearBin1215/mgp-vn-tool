# Bangumi API 使用文档

## 相关链接

- **API文档**：https://bangumi.github.io/api/
- **GitHub仓库**：https://github.com/bangumi/api/

## 请求规范

- API 地址：`https://api.bgm.tv`
- 根据 Bangumi API 的[User Agent建议](https://github.com/bangumi/api/blob/master/docs-raw/user%20agent.md)，本仓库发起 API 携带的 `User-Agent` 使用如下表达式生成：
    ```rust
    let user_agent = format!(
        "BearBin1215/mgp-vn-tool/{} (https://github.com/BearBin1215/mgp-vn-tool)",
        env!("CARGO_PKG_VERSION")
    );
    ```

## 错误响应

请求失败时返回 JSON，含 `title` / `description` 等字段：

HTTP 404
```json
{
  "title": "Not Found",
  "description": "resource can't be found in the database or has been removed",
  "details": { "path": "/v0/subjects/xxxx", "method": "GET" },
  "request_id": "a13390e34d403030-LHR"
}
```

## 使用接口

本工具用以下三个端点（以下示例均以 sprite / person `13541` 为例，长字段已截断，列表仅保留代表性项）：

### 1. 人物/组织信息

`GET /v0/persons/{person_id}`

返回该 person 的信息。本工具仅使用 `name` 与 `infobox` 中的别名、官网。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | number | person id |
| `name` | string | 名称 |
| `type` | number | 1=个人，2=组织/会社 |
| `infobox` | array | 信息框项，见下 |
| `summary` | string | 简介（本工具未使用） |
| `images`/`img`/`career`/`stat` 等 | - | 其余字段，本工具未使用 |

`infobox` 每项为 `{ "key": string, "value": string | array }`。`value` 形态不固定：
- **字符串**：如 `"官网"`、`"Twitter"`；
- **数组**：如 `"别名"`，每项为 `{ "v": string }`。

本工具从 `infobox` 提取：
- `key` 为 `别名`/`英文名`/`简体中文名` → 收集为别名（字符串取值，数组取每个 `v`）；
- `key` 为 `官网`/`主页` → 取为官网（字符串取值）。

```json
{
  "id": 13541,
  "name": "sprite",
  "type": 2,
  "summary": "Selenと同じく有限会社アクセルのブランドであるが…（略）",
  "infobox": [
    { "key": "别名", "value": [ { "v": "雪碧社" }, { "v": "fairys" } ] },
    { "key": "Twitter", "value": "@sprite_fairys" },
    { "key": "官网", "value": "https://sprite.net/" }
  ],
  "career": ["producer"]
}
```

### 2. 人物/组织的作品列表

`GET /v0/persons/{person_id}/subjects`

一次返回该 person 关联的**全部**条目（无分页），为扁平数组。每个条目代表一条「person × 条目」的职务关联。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | number | 条目 subject id |
| `name` | string | 原名 |
| `name_cn` | string | 中文名，无则空串 |
| `type` | number | 条目类型，见下 |
| `staff` | string | 该 person 在本条目的职务（如「开发」「原作」「厂牌」） |
| `image`/`eps` | - | 本工具未使用 |

`type` 含义（与网站显示一致）：

| type | 含义 | 本工具处理 |
| --- | --- | --- |
| 1 | 书籍 | 纳入「游戏衍生书籍」 |
| 2 | 动画 | 纳入「游戏衍生动画」 |
| 3 | 音乐 | 纳入「游戏衍生音乐」 |
| 4 | 游戏 | **排除**（Galgame 由 VNDB 提供） |

> 注意：同一 `id` 可能因多个 `staff` 职务重复出现（见下例 `id: 308808` 出现两次）。本工具按 `id` 去重，只保留一次。

```json
[
  { "staff": "原作", "name": "蒼の彼方のフォーリズム", "name_cn": "苍之彼方的四重奏", "type": 1, "id": 188886 },
  { "staff": "原作", "name": "恋と選挙とチョコレート", "name_cn": "恋爱和选举与巧克力", "type": 2, "id": 27236 },
  { "staff": "厂牌", "name": "BIRTHDAY SURPRISE", "name_cn": "", "type": 3, "id": 134460 },
  { "staff": "开发", "name": "蒼の彼方のフォーリズム", "name_cn": "苍之彼方的四重奏", "type": 4, "id": 76912 },
  { "staff": "企画", "name": "蒼の彼方のフォーリズム EXTRA2", "name_cn": "苍之彼方的四重奏 EXTRA2", "type": 4, "id": 308808 }
]
```

### 3. 作品信息

`GET /v0/subjects/{subject_id}`

返回单个条目详情。列表端点不含发行日期，本工具对列表中每个条目**逐条**调用本端点获取 `date`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | number | 条目 id |
| `name`/`name_cn` | string | 原名 / 中文名 |
| `date` | string \| null | 发售/放送日期，`YYYY-MM-DD`，可能为空或缺失 |
| `type` | number | 条目类型（同上） |
| `platform`/`summary`/`infobox`/`tags`/`rating` 等 | - | 其余字段，本工具未使用 |

```json
{
  "id": 104514,
  "name": "恋と選挙とチョコレート",
  "name_cn": "恋爱与选举与巧克力",
  "date": "2011-07-27",
  "type": 1,
  "platform": "漫画",
  "summary": "　　大岛裕树和住吉千里。青梅竹马的这两人…（略）",
  "infobox": [
    { "key": "中文名", "value": "恋爱与选举与巧克力" },
    { "key": "原作", "value": "sprite" },
    { "key": "发售日", "value": "2011-07-27" }
  ],
  "tags": [ { "name": "漫画", "count": 12 }, { "name": "恋爱", "count": 10 } ]
}
```
