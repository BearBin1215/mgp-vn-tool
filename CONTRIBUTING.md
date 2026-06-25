# 参与开发

- [开发准备](#开发准备)
  - [开发环境](#开发环境)
  - [开发命令](#开发命令)
- [前端技术栈](#前端技术栈)
- [构建并发布](#构建并发布)
- [代码规范](#代码规范)
  - [TypeScript / React](#typescript--react)
  - [样式](#样式)
- [持久化存储](#持久化存储)
  - [与 Zustand 集成](#与-zustand-集成)
  - [存储文件](#存储文件)
- [前后端通信](#前后端通信)
  - [批评空间](#批评空间)
  - [萌娘百科 API](#萌娘百科-api)
- [提交规范](#提交规范)
- [其他](#其他)

## 开发准备

### 开发环境

1. 首先按照 [Tauri 官方文档](https://tauri.app/zh-cn/start/prerequisites)做好Rust、Microsoft C++ 生成工具等前置环境的准备。
2. 安装 [node.js](https://nodejs.org/zh-cn) 20.19+/22.12+。
3. 安装 [pnpm](https://pnpm.io/zh-CN/docs/installation) 作为包管理器。

推荐使用 [VS Code](https://code.visualstudio.com/) 作为编辑器，打开本工程后会提示安装 rust-analyzer、Tauri 等扩展。RustOver等其他编辑器/IDE请自行翻阅官方文档。

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
- **路由**: [React Router v7](https://reactrouter.com/)
- **构建**: [Vite 8](https://cn.vitejs.dev/) + [Tauri v2](https://tauri.app/zh-cn/)

## 构建并发布

将代码合并到 release 分支会触发 GitHub Actions 自动构建。成功后会推送草稿到 [GitHub Release](https://github.com/BearBin1215/mgp-vn-tool/releases)，需要前往 Release 页面编辑并正式发布。

如果要在本地构建预览效果，可以执行构建命令：
```bash
pnpm tauri build
```
构建成功后，可在 `src-tauri/target/release` 目录下找到可执行文件。


## 代码规范

### TypeScript / React

- 严格遵循 [eslint 规则](/eslint.config.ts)，提交前执行`pnpm lint`或在开发时安装eslint插件（用VS Code打开本仓库时会自动推荐安装）
- 每个函数开头都需要用 jsdoc 说明作用
- 共享组件放在 `src/components/` 目录，仅单页面使用的组件和对应页面的入口`index.tsx`放在同一目录
- 需要flex布局时，静态布局使用 div + tailwindcss（`<div className='flex'></div>`），仅在需要动态参数时使用antd的`Flex`组件

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

### 批评空间

详见 [docs/erogamescape_api.md](docs/erogamescape_api.md)。

### 萌娘百科 API

详见 [docs/moegirl_api.md](docs/moegirl_api.md)。

## 提交规范

本项目采用[约定式提交](https://www.conventionalcommits.org/zh-hans/)。

示例：
- `feat(cv-generator): 添加声优条目生成功能`
- `fix(article-stats): 修复分类筛选逻辑错误`
- `docs: 批评空间API示例修改`

## 其他

除非你的母语不是中文，不论注释还是提交，请使用中文！
