# AGENTS.md - AI 编程指南

## 项目概述

萌百视觉小说研究会条目工具（mgp-vn-tool），基于Tauri v2构建的桌面应用，供萌百视觉小说研究会成员使用，用于生成条目代码、获取条目信息等。

- 面向中文用户，若无另外要求，对话、注释及输出文档都使用中文
- 在实现具体功能中如果遇到多个可选方案，可让用户选择

本文档是面向 AI 的开发指南。代码规范、实现细节等内容见[CONTRIBUTING.md](CONTRIBUTING.md)，各站点 API 说明见 `docs/` 目录。

## 技术栈

- **后端**: Rust 2021 (Tauri v2)
- **前端包管理器**: pnpm
- **前端**: TypeScript + React 19 + Tailwind CSS v4
- **状态管理**: Zustand
- **路由**: React Router v8（无需react-router-dom）
- **UI 组件库**: Ant Design (antd) v6
- **多语言变体**: i18next v26 + react-i18next v17（简繁变体，natural key 模式）

## 常用命令

```bash
pnpm install    # 安装依赖
pnpm tauri dev  # 启动开发服务器（同时启动前端和 Tauri）

cargo check     # 后端静态检查
cargo clippy    # 后端代码静态分析
cargo test      # 后端测试

pnpm typecheck  # 前端类型检查
pnpm lint       # 前端 eslint 检查
pnpm lint:fix   # 前端 eslint 检查并修复
pnpm test       # 前端单元测试（vitest）
pnpm check      # 前端聚合检查（typecheck + lint + test）
```

## 行为准则

- **不遵循最小修改原则，积极重构**：修改模块时将其作为一个整体进行修改，不要只纯粹打补丁；涉及多模块变更时综合考虑全局，不要为了少修改而拒绝更优方案。
- **多权衡，多质疑**：除非要求明确，否则不将现有实现视为绝对正确，发现更优方案时让用户决定；不死守文档，实践中发现错误时修改并告知用户。

## 架构要点

- **路由与菜单**：`src/routes.tsx` 同时驱动路由和侧边栏菜单（支持顶级和一级折叠）。新增页面时在 `src/pages/` 下创建组件、在此注册路由，并以 `Page` 组件（`src/components/page.tsx`）作为页面外壳。
- **前后端通信**：前端通过 Tauri `invoke()` 调用 Rust 命令，各站点处理方式不同（详见 `docs/` 下对应文档）：
  - **萌娘百科**：单次查询经后端 `moegirl_request` 转发，前端直接使用 MediaWiki JSON（类型来自 `types-mediawiki-response` 包及 `src/lib/moegirl-response.d.ts` 的萌百定制增广）；批量查询（页面信息、分类重定向、日志、源代码）由后端 `moegirl_query_*` 命令完成分批与 continue 分页
  - **飞书**：token 获取、统计表读取/追加行/样式设置均由后端完成；App ID / App Secret 由后端直接从设置存储读取，前端调用时不传凭据
  - **批评空间**：后端解析 HTML 返回结构化数据，前端通过 `src/api/erogamescape.ts` 的 `unwrap()` 解包响应
- **持久化**：设置与条目数据持久化到 Tauri Store（用户配置目录下的 JSON 文件），与 Zustand 集成的标准写法见 CONTRIBUTING.md 及 `src/stores/` 现有实现。新增设置项时在 `src/stores/settings-store.ts` 定义类型、getter/setter 与持久化逻辑，并在设置页添加 UI。

## 萌娘百科相关

萌娘百科基于 MediaWiki 系统，涉及部分用语如下：

- 内链：内部链接，可以在萌娘百科的页面之间跳转，格式为`[[页面名]]`，如`[[Galgame]]`
- 外链：外部链接，用于跳转到外部网站，格式为`[网站地址 显示文本]`，如`[https://www.google.com/ Google]`
- 分类：页面所属分类，给页面添加形如`[[分类:分类名]]`/`[[Category:分类名]]`/`[[Cat:分类名]]`的代码即可使其归入该分类
- 模板：可以嵌入的复用页面代码，格式为`{{模板名|命名参数1=值1|匿名参数1|匿名参数2|...}}`
- 大家族：嵌入在页面末尾的大家族模板，通常为该页面所属的上一级，比如作品/角色条目所属的会社大家族，会社条目所属的`{{Galgame公司}}`大家族等
- 信息栏：嵌入在页面顶部的信息栏模板，每种类型的页面通常有对应的信息栏

由于萌娘百科在API、权限等方面有较多定制化内容，未说明的内容不要直接照搬MediaWiki文档，应与用户确认。

## 代码审查

- 审查安全性时，批评空间镜像站账号密码、飞书统计表 App Secret 属于应用配置，按现有产品范围使用明文存储；飞书功能包含向统计表追加数据和设置样式，审查时应关注写入权限、错误信息是否泄露凭据，以及萌百请求中的 Cookie 是否泄露。现阶段不涉及提交内容到萌娘百科的功能
- 批评空间 SQL 执行页只能用于读取，且本身有防注入，无需考虑安全风险
- 如非后果极其严重，不考虑用户不规范使用导致预期外行为（比如手动修改设置文件）
