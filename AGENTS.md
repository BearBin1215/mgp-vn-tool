# AGENTS.md - AI 编程指南

## 项目概述

萌百视觉小说研究会条目工具（mgp-vn-tool），基于Tauri v2构建的桌面应用，供萌百视觉小说研究会成员使用，用于生成条目代码、获取条目信息等。

- 面向中文用户，若无另外要求，对话、注释及输出文档都使用中文
- 在实现具体功能中如果遇到多个可选方案，可让用户选择

本文档是面向 AI 的开发指南。代码规范、实现细节等内容见[CONTRIBUTING.md](CONTRIBUTING.md)，各个站点 API 或其爬虫封装见 `docs/` 目录，本文档仅包含其未覆盖内容。

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
pnpm install # 安装依赖
pnpm tauri dev # 启动开发服务器（同时启动前端和 Tauri）

cargo check  # 后端静态检查
cargo clippy # 后端代码静态分析
cargo test   # 后端测试

pnpm typecheck # 前端类型检查
pnpm lint      # 前端 eslint 检查
pnpm lint:fix  # 前端 eslint 检查并修复
pnpm test      # 前端单元测试（vitest）
pnpm check     # 前端聚合检查（typecheck + lint + test）
```

## 行为准则

- **不遵循最小修改原则，积极重构**：
  - 修改模块时将其作为一个整体进行修改，不要只纯粹打补丁。
  - 涉及多模块变更时，综合考虑全局，不要为了少修改而拒绝更优方案。
- **多权衡，多质疑**：
  - 除非要求明确，否则不将现有实现视为绝对正确，发现更优方案时让用户决定。
  - 不死守文档，实践中发现错误时修改，告知用户。

## 项目结构

仅列出总体结构和代表性文件

```
mgp-vn-tool/
├── src/                        # 前端源码
│   ├── api/                    # API 封装
│   │   ├── erogamescape.ts     # 批评空间 API 封装
│   │   ├── feishu.ts           # 飞书统计表 API 封装
│   │   └── ...
│   ├── assets/                 # 静态资源
│   ├── icons/                  # 图标组件目录
│   ├── i18n/                   # 多语言（基于 react-i18next 的简繁支持）
│   ├── components/             # 共享组件
│   │   ├── layout/             # 布局组件（Layout + Menu）
│   │   ├── page.tsx            # 页面外壳组件
│   │   └── ...
│   ├── lib/                    # 工具库
│   │   ├── types.ts            # 共享类型定义
│   │   ├── moegirl-response.d.ts # MediaWiki 类型包的萌百定制字段增广
│   │   ├── config-store.ts     # 配置存储
│   │   └── ...
│   ├── utils/                  # 纯工具函数
│   ├── pages/                  # 页面组件
│   ├── stores/                 # Zustand 状态管理及对应持久化存储
│   ├── App.tsx                 # 根组件
│   ├── App.css                 # 全局样式
│   ├── routes.tsx              # 路由、菜单配置
│   └── main.tsx                # 入口文件
├── src-tauri/                  # Tauri 后端
│   ├── src/
│   │   ├── lib.rs              # Tauri 配置和 Rust API 命令
│   │   ├── error.rs            # 前端可识别的结构化错误（错误码 + 插值参数 + 简体原文）
│   │   ├── feishu.rs           # 飞书统计表读写与样式设置
│   │   ├── moegirl_query.rs    # 萌百批量查询命令（分批、continue 分页）
│   │   ├── http.rs             # 网络请求模块
│   │   ├── settings.rs         # 统一从 Tauri Store 读取 settings.json
│   │   ├── main.rs             # 入口
│   │   └── ...
│   ├── capabilities/           # Tauri 权限配置
│   ├── tauri.conf.json         # Tauri 核心配置
│   └── Cargo.toml              # Rust 依赖
├── .github/                    # GitHub Actions 工作流
├── docs/                       # 文档
│   ├── images/                 # 文档用图片
│   ├── moegirl_api.md          # 萌娘百科 API 说明
│   ├── erogamescape_api.md     # 批评空间 API 说明
│   ├── vndb_api.md             # VNDB API 说明
│   ├── bangumi_api.md          # Bangumi API 说明
│   └── feishu_api.md           # 飞书统计表 API 说明
├── CONTRIBUTING.md             # 协作指南
└── ...
```

等结构变动后，将对应内容回写到此处。

## 架构模式

### 路由与菜单

路由配置同时驱动路由和侧边栏菜单：

```tsx
// routes.tsx
export const routes: RouteConfig[] = [
  {
    path: "/",
    component: About,
    label: "关于",
    icon: <InfoIcon />,
  },
];
```

菜单支持顶级和一级折叠，具体写法见routers.tsx。

### 前后端通信

前端通过 Tauri `invoke()` 调用 Rust 命令。不同 API 的响应处理方式不同：

- **萌娘百科**：单次查询经 Rust 后端 `moegirl_request` 转发，前端直接使用 MediaWiki API 返回的 JSON，响应类型使用 `types-mediawiki-response` 包提供类型，萌百定制字段通过 `src/lib/moegirl-response.d.ts` 声明合并增广；批量查询（页面信息、分类重定向、日志、源代码）由 `moegirl_query_*` 命令在后端完成分批与 continue 分页，返回结构化数据
- **飞书**：Rust 后端统一获取 token，负责统计表读取（返回已解析物理列和日期的结构化行）、业务字段转 A-F 表格数据、追加行（已有行数由后端实时统计）、新增行样式设置；飞书 App ID / App Secret 由后端直接从设置存储读取，前端调用时不传凭据
- **批评空间**：Rust 后端解析 HTML 返回结构化数据，前端通过 `src/api/erogamescape.ts` 提供的 `unwrap()` 方法解包响应。

详细文档：
- 批评空间：[docs/erogamescape_api.md](docs/erogamescape_api.md)
- 飞书：[docs/feishu_api.md](docs/feishu_api.md)
- 萌娘百科：[docs/moegirl_api.md](docs/moegirl_api.md)

### 持久化存储模式

设置和条目数据持久化到 Tauri Store（用户配置目录下的 JSON 文件），标准写法：

```typescript
import { Store } from '@tauri-apps/plugin-store';
import { appConfigDir, join } from '@tauri-apps/api/path';

// 获取 store 路径并创建实例
const getStorePath = async (): Promise<string> => {
  const configDir = await appConfigDir();
  return await join(configDir, 'filename.json');
};
const storePromise = getStorePath().then((path) => Store.load(path));

// 读取
const store = await storePromise;
const value = await store.get<Type>('key');

// 写入
await store.set('key', value);
await store.save();
```

## 添加新页面

1. 在 `src/pages/` 下创建新目录和 `index.tsx`
2. 在 `src/routes.tsx` 中添加路由配置（包含 label、icon、position）
3. 使用 `Page` 组件作为页面外壳

## 添加新设置项

1. 在 `src/stores/settings-store.ts` 中：
  - 定义类型
  - 添加到 `SettingsStore` 接口
  - 添加 getter 和 setter 方法
  - 添加持久化逻辑
2. 在 `src/pages/settings/index.tsx` 中添加 UI

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
