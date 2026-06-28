# AGENTS.md - AI 编程指南

## 项目概述

萌百视觉小说研究会条目工具（mgp-vn-tool），基于Tauri v2构建的桌面应用，供萌百视觉小说研究会成员使用，用于生成条目代码、获取条目信息等。

## 技术栈

- **后端**: Rust 2021 (Tauri v2)
- **前端包管理器**: pnpm
- **前端**: TypeScript + React 19 + Tailwind CSS v4
- **状态管理**: Zustand
- **路由**: React Router v7
- **UI 组件库**: Ant Design (antd) v6

## 常用命令

```bash
# 安装依赖
pnpm install

# 启动开发服务器（同时启动前端和 Tauri）
pnpm tauri dev

# 前端类型检查
pnpm tsc --noEmit

# 后端检查
cargo check

# 前端 eslint 检查
pnpm lint

# 前端 eslint 检查并修复
pnpm lint:fix
```

## 项目结构

```
mgp-vn-tool/
├── src/                        # 前端源码
│   ├── api/                    # API 封装
│   │   ├── erogamescape.ts     # 批评空间 API 封装
│   │   ├── feishu.ts           # 飞书 API 封装
│   │   └── moegirl.ts          # 萌娘百科 API 封装
│   ├── assets/                 # 静态资源
│   ├── components/             # 共享组件
│   │   ├── layout/             # 布局组件（Layout + Menu）
│   │   ├── page/               # 页面外壳组件
│   │   ├── KeepAlive.tsx       # 页面状态缓存组件
│   │   └── MoegirlLink.tsx     # 萌百链接组件
│   ├── lib/                    # 工具库
│   │   ├── types.ts            # 共享类型定义
│   │   ├── moegirlDict.ts      # 萌百中文映射（用户组等）
│   │   └── erogamescapeDict.ts # 批评空间中文映射（职种等）
│   ├── utils/                  # 纯工具函数
│   │   ├── articleMap.ts       # 批评空间数据映射等
│   │   ├── constants.ts        # 常量定义
│   │   └── text.ts             # 文本处理工具
│   ├── pages/                  # 页面组件
│   │   ├── about/              # 关于页面（首页）
│   │   ├── article-stats/      # 条目统计
│   │   ├── cv-generator/       # 声优条目生成
│   │   ├── company-generator/  # 会社条目生成
│   │   └── settings/           # 设置页面
│   ├── stores/                 # Zustand 状态管理及对应持久化存储
│   │   ├── settingsStore.ts    # 应用设置
│   │   ├── moegirlStore.ts     # 萌百数据（用户组等）
│   │   └── articleStore.ts     # 条目统计数据
│   ├── App.tsx                 # 根组件
│   ├── App.css                 # 全局样式
│   ├── routes.tsx              # 路由、菜单配置
│   └── main.tsx                # 入口文件
├── src-tauri/                  # Tauri 后端
│   ├── src/
│   │   ├── lib.rs              # Tauri 配置和 Rust API 命令
│   │   ├── settings.rs         # 统一从 Tauri Store 读取 settings.json
│   │   ├── erogamescape.rs     # 批评空间 API
│   │   ├── feishu.rs           # 飞书 API
│   │   ├── moegirl.rs          # 萌娘百科 API
│   │   └── main.rs             # 入口
│   ├── capabilities/           # Tauri 权限配置
│   ├── tauri.conf.json         # Tauri 核心配置
│   └── Cargo.toml              # Rust 依赖
├── .github/                    # GitHub Actions 工作流
├── docs/                       # 文档
│   ├── images/                 # 文档用图片
│   ├── moegirl_api.md          # 萌娘百科 API 说明
│   └── erogamescape_api.md     # 批评空间 API 说明
├── CONTRIBUTING.md             # 协作指南
├── package.json                # 前端依赖
├── eslint.config.ts            # eslint 配置
└── vite.config.ts              # Vite 配置
```

新建页面/组件/工具函数等文件后，将对应内容写入这里。

## 编码规范

### TypeScript

- 遵循`eslint.config.ts`内的ESLint规则（2空格缩进、分号结尾、优先单引号等）
- 涉及复杂逻辑需添加注释；每个函数开头都需要用jsdoc说明作用
- 禁止未使用的变量和参数（`_` 前缀可忽略）
- 工具函数优先检查lodash库是否提供

### React

- 遵循`eslint.config.ts`内的ESLint规则（禁用冗余Fragment、组件单行最多2参数等）
- 遵循React提倡的**保持组件纯粹**原则，每个组件都必须是纯函数
- 组件命名和导出使用 `export default function ComponentName()`
- 组件使用PascalCase命名法，hooks以`use`开头
- 共享组件放在 `src/components/` 目录，仅单页面使用的组件和对应页面的入口`index.tsx`放在同一目录
- 需要flex布局时，静态布局使用 div + tailwindcss（`<div className='flex'></div>`），仅在需要动态参数时使用antd的`Flex`组件

antd 的 `message`、`notification`、`modal` 静态方法使用 `App` 组件提供的实例以消费上下文：
```tsx
import { App } from 'antd';

function Component() {
  const { message } = App.useApp();
  message.success('操作成功');
}
```

### 样式

- 优先使用 Tailwind CSS 编写样式
- 兼容不同颜色主题，编写样式时尽可能使用Ant Design提供的CSS变量（`cssVar` 已启用）
- 使用CSS原生嵌套

### Rust

- 使用 4 空格缩进
- 遵循 Rust 标准风格
- 每个函数开头需有文档注释

## 架构模式

### 状态管理

使用 Zustand 进行状态管理，设置持久化存储在 Tauri Store：

```typescript
// stores/settingsStore.ts
export const useSettingsStore = create<SettingsStore>((set) => ({
  // 状态和更新方法
}));
```

### 路由与菜单

路由配置同时驱动路由和侧边栏菜单：

```typescript
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

### 前后端通信

前端通过 Tauri `invoke()` 调用 Rust 命令。不同 API 的响应处理方式不同：

- **萌娘百科**：Rust 后端转发请求，前端直接使用 MediaWiki API 返回的 JSON，无需额外处理
- **飞书**：Rust 后端转发请求并返回结构化数据（自动获取 token 并请求表格）
- **批评空间**：Rust 后端解析 HTML 返回结构化数据，前端通过 `unwrap()` 解包响应：

```typescript
// src/api/erogamescape.ts
interface ErogamescapeResponse<T> {
  statusCode: string;
  result: 'success' | 'fail';
  response: T;
}

export function unwrap<T>(res: ErogamescapeResponse<T>): T {
  if (res.result === 'fail') {
    throw new Error(String(res.response || '请求失败'));
  }
  return res.response;
}

export async function queryCreatorWorks(creatorId: number): Promise<QueryResult> {
  const res = await invoke<ErogamescapeResponse<QueryResult>>('query_creator_works', { creatorId });
  return unwrap(res);
}
```

详细文档：
- 批评空间：[docs/erogamescape_api.md](docs/erogamescape_api.md)
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

### Page 组件

所有页面必须使用 `Page` 组件包裹，它提供统一的页顶和内容区：

```tsx
import Page from "@/components/page";

export default function MyPage() {
  return (
    <Page actions={<Button color="inherit">操作</Button>}>
      页面内容
    </Page>
  );
}
```

Props：
- `actions`：页顶右侧的操作按钮区域（可选）
- `subtitle`：页顶标题旁的副标题（可选）
- `padding`：内容区内边距开关，默认 `true`；需要 sticky 筛选栏等自定义布局时设为 `false`
- `className`：内容区自定义 className（可选）
- `children`：页面内容

## 添加新设置项

1. 在 `src/stores/settingsStore.ts` 中：
  - 定义类型
  - 添加到 `SettingsStore` 接口
  - 添加 getter 和 setter 方法
  - 添加持久化逻辑
2. 在 `src/pages/settings/index.tsx` 中添加 UI

## 故障排查

- **类型错误**: 运行 `pnpm tsc --noEmit`
- **ESLint 错误**: 执行 eslint 指令，能自动修复的用 `--fix` 参数自动修复，不能自动修复的进行提示
- **Tauri 启动失败**: 检查 Rust 环境和依赖
