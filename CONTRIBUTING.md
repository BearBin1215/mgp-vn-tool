# 参与开发

- [开发准备](#开发准备)
  - [开发环境](#开发环境)
  - [开发命令](#开发命令)
- [前端技术栈](#前端技术栈)
- [构建并发布](#构建并发布)
- [代码规范](#代码规范)
  - [检查](#检查)
  - [注释](#注释)
  - [TypeScript / React](#typescript--react)
  - [样式](#样式)
  - [Rust](#rust)
- [简繁支持](#简繁支持)
- [持久化存储](#持久化存储)
  - [与 Zustand 集成](#与-zustand-集成)
  - [存储文件](#存储文件)
- [前后端通信](#前后端通信)
- [提交规范](#提交规范)
- [其他](#其他)

## 开发准备

### 开发环境

1. 首先按照 [Tauri 官方文档](https://tauri.app/zh-cn/start/prerequisites)做好Rust、Microsoft C++ 生成工具等前置环境的准备。
2. 安装 [node.js](https://nodejs.org/zh-cn) 20.19+/22.12+。
3. 安装 [pnpm](https://pnpm.io/zh-CN/docs/installation) 作为包管理器。

推荐使用 [VS Code](https://code.visualstudio.com/) 作为编辑器，打开本工程后会提示安装 rust-analyzer、Tauri 等扩展。RustRover等其他编辑器/IDE请自行翻阅官方文档。

### 开发命令

准备完毕后执行
```bash
# 安装依赖
pnpm install

# 启动开发
pnpm tauri dev
```

启动成功后，在应用窗口按 <kbd>F12</kbd> 打开浏览器开发者工具。

## 前端技术栈

- **框架**: [React 19](https://react.docschina.org/) + [TypeScript](https://www.typescriptlang.org/zh/)
- **样式**: [Tailwind CSS v4](https://tailwindcss.com/) + [Ant Design v6](https://ant.design/index-cn/)
- **状态管理**: [Zustand](https://zustand.docs.pmnd.rs/)
- **路由**: [React Router v8](https://reactrouter.com/)（无需react-router-dom）
- **国际化**: [i18next](https://www.i18next.com/) + [react-i18next](https://react.i18next.com/)（简繁变体）
- **构建**: [Vite 8](https://cn.vitejs.dev/) + [Tauri v2](https://tauri.app/zh-cn/)

## 构建并发布

推送 `v*` tag 会触发 GitHub Actions 自动构建。成功后会推送草稿到 [GitHub Release](https://github.com/BearBin1215/mgp-vn-tool/releases)，需要前往 Release 页面编辑并正式发布。

发版步骤如下：

1. 用脚本统一修改版本号，支持显式版本号或自增关键字：
   ```bash
   pnpm bump <version>   # 显式指定，如 pnpm bump 1.2.3
   pnpm bump <keyword>   # 基于当前版本自增：major / minor / patch
   ```
2. 提交改动并打 tag（tag 名须为 `v` + 版本号，含预发布后缀）：
   ```bash
   git commit -am "chore: 发布 v<version>"
   git tag v<version>
   ```
3. 推送 tag 触发 CI：
   ```bash
   git push origin v<version>
   ```

如果要在本地构建预览效果，可以执行构建命令：
```bash
pnpm tauri build
```
构建成功后，可在 `src-tauri/target/release` 目录下找到可执行文件。

## 代码规范

### 检查

提交代码前，应当通过如下指令检查无错误：

在src-tauri目录内执行：

```bash
# 后端静态检查
cargo check

# 后端代码静态分析
cargo clippy

# 后端测试
cargo test
```

在根目录执行：

```bash
# 前端检查
pnpm check
```

### 注释

- 前后端代码涉及复杂逻辑均要添加注释。
- 注释中文优先、人类可读，不要在一句注释里同时混入大量英文和代码片段。
- 注释面向读者而非过去，不要添加`之前是……现在改为……`等对比性注释，除非原代码需要重点提醒后来开发者不要使用。

### TypeScript / React

- 每个函数开头都需要用 jsdoc 说明作用，utils 内的复杂工具函数需要给每个参数添加对应的`@param`。
- 工具函数优先检查 `es-toolkit` 或现有依赖是否提供；简单逻辑优先使用原生 API，避免为使用工具库而增加间接性。
- 积极引入现有成熟库，避免重复造轮子。
- 遵循React提倡的**保持组件纯粹**原则，每个组件都必须是纯函数。
- 组件内变量、函数、hooks定义按功能归类分组排序。
- 组件使用大驼峰命名法，hooks以`use`开头。
- 共享组件放在 `src/components/` 目录，仅单页面使用的组件和对应页面的入口`index.tsx`放在同一目录。
- 共享组件props要求使用 `interface` 定义，除 className、disabled 等通用参数外每个参数都要有对应的 jsdoc 注释。
- 需要flex布局时，静态布局使用 div + tailwindcss（`<div className='flex'></div>`），仅在需要动态参数时使用antd的`Flex`组件。

antd 的 `message`、`notification`、`modal` 静态方法使用 `App` 组件提供的实例以消费上下文：

```tsx
import { App } from 'antd';

function Component() {
  const { message } = App.useApp();
  message.success('操作成功');
}
```

### 样式

* 本项目使用 [Tailwind CSS](https://tailwindcss.com/) 编写样式。尽可能使用 Tailwind CSS 提供的类名。
* `@tailwindcss/vite` 插件底层使用 Lightning CSS 引擎，会处理原生 CSS 嵌套语法，可放心使用原生嵌套。
* 为了兼容浅色和深色主题，编写样式时尽可能[使用 Ant Design 提供的 CSS 变量](https://ant.design/docs/react/customize-theme-cn)。

**CSS 文件中使用 CSS 变量：**

```css
.my-header {
  background-color: var(--ant-color-bg-container);
  border-bottom: 1px solid var(--ant-color-border-secondary);
}
```
或使用tailwindcss的类名：
```tsx
function App() {
  return (
    <div className='bg-(--ant-color-bg-container) border-b border-(--ant-color-border-secondary)'>
      content
    </div>
  );
}
```

**JSX 中使用 token：**

```tsx
function App() {
  const { token } = theme.useToken();
  return (
    <div style={{ color: token.colorText }}>文本</div>
  );
}
```

常用 CSS 变量：
- `--ant-color-bg-container`：容器背景色
- `--ant-color-bg-elevated`：浮层背景色
- `--ant-color-text`：主文本色
- `--ant-color-text-secondary`：次要文本色
- `--ant-color-text-tertiary`：三级文本色
- `--ant-color-border`：边框色
- `--ant-color-border-secondary`：次级边框色

### Rust

- 使用 4 空格缩进，遵循 Rust 标准风格
- 每个函数开头需有文档注释
- 积极引入现有成熟 crate，避免重复造轮子


## 简繁支持

应用界面支持简体中文、繁体中文（臺灣）与繁体中文（香港），基于 i18next 实现。用户在设置页的「界面语言」切换，选择持久化在 `settings.json` 的 `uiLanguage` 字段，启动时由 `initI18n()` 初始化。

采用 natural key 模式，即**界面文案的 key 就是简体原文**，因此代码中直接写简体中文即可运行，不需要预先维护语言包：

```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();
  return <Button>{t('生成条目')}</Button>;
}
```

新增或修改界面文案时：

1. 代码中直接写简体原文，并用 `t()` 包裹
2. 需要动态内容的，用 `{{}}` 插值，不要拼接字符串：
   ```tsx
   t('共 {{count}} 条结果', { count: total })
   ```
3. 在 [`src/i18n/zh-TW.ts`](/src/i18n/zh-TW.ts)（台湾繁体）和 [`src/i18n/zh-HK.ts`](/src/i18n/zh-HK.ts)（香港繁体）中补充对应的繁体映射，key 必须与简体原文完全一致；未收录的 key 会自动回退显示简体，不会白屏

注意事项：

- 已禁用 `keySeparator` 和 `nsSeparator`，避免原文中的冒号、点号被误解析为分隔符
- 不要在业务代码里自行做简繁转换或手写语言映射表
- 前后端通信显示文本如错误信息、接口响应时，由后端返回编码、前端查表实现多语言支持
- 语言选项名称（如「简体中文」「繁體中文（臺灣）」「繁體中文（香港）」）按各自语言展示，不参与转换
- 代码注释、提交信息、文档统一使用简体中文，只有面向用户的界面文案才需要转换

## 持久化存储

本项目使用 [Tauri Store](https://v2.tauri.app/plugin/store/) 进行本地数据持久化，存储于用户配置目录下的 JSON 文件。

### 与 Zustand 集成

持久化存储与 [Zustand](https://zustand.docs.pmnd.rs/) 状态管理配合使用，遵循以下模式：

1. **读取**：应用启动时从 Tauri Store 读取数据，初始化 Zustand store
2. **写入**：状态更新时同步写入 Tauri Store

```typescript
import { Store } from '@tauri-apps/plugin-store';
import { appConfigDir, join } from '@tauri-apps/api/path';

// 获取 store 路径并创建实例
const getStorePath = async (): Promise<string> => {
  const configDir = await appConfigDir();
  return await join(configDir, 'settings.json');
};
const storePromise = getStorePath().then((path) => Store.load(path));

// 初始化时读取
const initSettings = async () => {
  const store = await storePromise;
  const value = await store.get<Type>('key');
  useStore.setState({ value });
};

// 状态更新时写入
const setValue = async (value: Type) => {
  const store = await storePromise;
  await store.set('key', value);
  await store.save();
  set({ value });
};
```

### 存储文件

| 文件名 | 用途 |
|--------|------|
| settings.json | 应用设置（颜色模式、字体、API 配置等） |
| articles.json | 条目统计数据 |
| moegirl.json | 萌娘百科缓存数据 |

## 前后端通信

- 批评空间 [docs/erogamescape_api.md](docs/erogamescape_api.md)。
- 萌娘百科 API [docs/moegirl_api.md](docs/moegirl_api.md)。

## 提交规范

本项目采用[约定式提交](https://www.conventionalcommits.org/zh-hans/)。

## 其他

- 考虑到语言普及程度~~以及我的技术水平~~，后端Rust主要处理一些网络请求、底层逻辑等，在数据组织等场景如果没有性能压力都应放在前端。
- 除非你的母语不是中文，不论注释还是提交，请使用中文！
