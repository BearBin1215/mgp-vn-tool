# 飞书统计表增量更新检查功能

「条目统计」页的一键检查更新：以飞书表格 E 列（条目创建时间）最大值为增量起点，从萌娘百科获取此后新建的主命名空间条目，按分类规则筛选候选作品，用户完善信息后按创建时间升序追加回表格末尾并刷新本地数据。

## 已确认的设计决策

| 决策点 | 结论 |
|--------|------|
| 数据截止时间来源 | 表格 E 列（条目创建时间）的最大值，不新增专门单元格 |
| 增量起点计算 | 检查更新时**先全量重拉飞书表格**（复用 `fetchFeishuTable`），从最新数据取 E 列最大值，同时为去重提供依据 |
| 萌百增量接口 | `list=logevents` 于同一时间窗 `[E列最大创建日期, 当前]` 内两次查询：`letype=create` 取新建页面（含创建时间），`letype=move` 取移动映射（用于解析当前标题）；create/move 均已实测可用，请求/响应结构见[实测记录](moegirl_recentchanges.md) |
| 接口选型说明 | 弃用 recentchanges `rctype=new` 方案：它只返回创建时刻标题，「移动且不留重定向」时旧标题查询 missing 造成漏检且无法补救；logevents 的 create+move 组合可将创建时标题解析到当前标题，顺带消除「旧标题被重建」误检路径。注意 logevents 默认 `ledir=older`，圈定窗口需 `lestart=当前时间 & leend=起点`，与 recentchanges 方向相反 |
| 分类筛选规则 | 分类同时满足：含 `日本游戏作品` **且** 含 `视觉小说`/`恋爱冒险游戏`/`冒险游戏`/`文字冒险游戏` 之一；排除消歧义页、已删除页、表格已收录条目（含重定向目标已收录） |
| 写入方式 | 飞书 sheets v2 `values_append`（`insertDataOption=INSERT_ROWS`），A~E 五列按创建时间升序追加 |
| 功能形态 | 集成进条目统计页：actions 区「检查更新」按钮 + 弹窗向导 |

## 飞书写入接口契约

```
POST https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/{spreadsheetToken}/values_append?insertDataOption=INSERT_ROWS
Authorization: Bearer {tenant_access_token}
Content-Type: application/json

{
  "valueRange": {
    "range": "{sheetId}!A1:E1",
    "values": [["原名","条目名","制作组织","发行时间","创建时间"], ...]
  }
}
```

- `range` 定位区域只需覆盖目标列，服务端会从第一个空行开始追加；范围需大于等于 values 占用的范围。
- 响应结构与读取接口一致（`code`/`msg`/`data`），`code !== 0` 即失败。
- 无编辑权限时返回 HTTP 403/400。
- 单次写入限制：5000 行、100 列，远超本场景需求。

### 权限要求（缺一不可）

1. 在飞书开放平台为应用开通「查看、评论、编辑和管理电子表格」权限（scope：`sheets:spreadsheet`），可能需要版本发布与管理员审核；
2. 表主将目标表格授权给应用（把应用添加为表格协作者并给予编辑权限）。

## 实现结构

| 层 | 文件 | 内容 |
|----|------|------|
| Rust | `src-tauri/src/feishu.rs` | `feishu_append_rows` 命令：追加行，无权限错误返回可操作的中文提示；表格 token/工作表 ID 提取为常量 |
| Rust | `src-tauri/src/lib.rs` | 注册新命令 |
| API | `src/api/feishu.ts` | `appendRows(rows)` 封装 |
| Store | `src/stores/article-store.ts` | `fetchLogEvents(type)`（logevents 分页抓取，continue 含 `lecontinue`+`continue`，同标题去重保留最早时间）；`checkUpdates` action（同步表格 → 计算起点 → 抓取 create/move 两路日志 → 由 move 构建改名映射并对链式移动迭代收敛 → 以当前标题 `fetchPageInfo` 取分类 → 筛选去重（入库标题取当前规范标题）→ 生成 `candidates`）；`candidates`/`checking` state 与 `clearCandidates` |
| UI | `src/pages/article-stats/update-check-modal.tsx` | 候选表格弹窗：勾选、内联编辑（原名/制作组织/发行时间）、提交所选 |
| UI | `src/pages/article-stats/index.tsx` | 「检查更新」入口按钮、配置校验复用、提交后刷新 |

## 页面移动与标题获取

`logevents` 返回的是事件发生时刻的标题快照：create 记录创建时标题，move 记录 `{源标题 → 目标标题}` 映射（目标在日志详情中）。无论移动是否保留重定向，均按下述流程解析当前标题：

1. 同一窗口内抓取 create 与 move 两路日志；
2. 由 move 记录构建改名映射 `renameMap: from → to`，链式移动（A→B、B→C）做迭代收敛解析（带 seen 集合防环）；
3. 每个 create 标题经 `renameMap` 收敛得到当前标题；
4. 以当前标题调用 `fetchPageInfo`（仍带 `redirects=1&converttitles=1` 兜底处理历史遗留重定向与繁简转换）取得 pageid 与真实分类；
5. 入库标题 = 当前规范标题；候选条目的创建时间取 create 记录的时间戳。

相比仅依赖查询侧重定向解析的原方案，该机制同时消除两类缺陷：

- **移动且不留重定向**：不再依赖查询旧标题（missing 即漏检），直接由 move 映射定位新标题；
- **旧标题之后被重建为无关页面**：查询入口不再是旧标题，消除误检路径。

实测记录中大量存在 `suppressredirect: true` 的移动（不留重定向），印证该机制确属必要。

实现细节：

- `letype` 为单值参数，create 与 move 各发起一次分页请求（move 数量远少于 create，开销可忽略）；
- move 日志详情已在萌百实测确认：`leprop=title|timestamp|details` 时每条记录含 `title`（源标题）与 `params`（`target_title` 目标标题、`target_ns` 目标命名空间、`suppressredirect` 是否保留重定向），构建映射取 `params.target_title` 即可；
- 窗口边界安全：窗口终点为当前时间，窗口内 create 对应页面若发生移动，move 必然也已落在同一窗口内。

## 边界与风险

- **E 列仅有日期精度**：起始日当天早于最后一条创建时间的条目会被重复检出，靠全表去重兜底；
- **日志保留期**：萌百保留期为 90 天（已确认），正常使用中表格更新间隔远小于该值，无需特殊处理；
- **期间被移动的页面**：经 move 日志映射 + 查询兜底解析当前标题入库，详见「页面移动与标题获取」；
- **写权限未开通**：Rust 侧识别 HTTP 403/400 并提示开通权限与添加协作者，UI 直接展示，不静默失败。

## 待验证事项

- [x] 萌百 `recentchanges`/`logevents (create)`/`logevents (move)` 可用性与响应结构（已实测，见 [moegirl_recentchanges.md](moegirl_recentchanges.md)）
- [x] 萌百日志保留期：90 天（正常使用无需处理）
- [x] move 日志详情结构：目标标题位于 `params.target_title`，另含 `target_ns` 与 `suppressredirect`
- [ ] 飞书应用写权限开通结果（scope 生效 + 协作授权完成）

## 后续可选增强

- 批评空间 API 辅助预填候选条目的日文原名/会社/发行时间；
- 创建时间精确到时分秒（当前仅日期粒度）。
