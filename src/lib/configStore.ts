import { invoke } from '@tauri-apps/api/core';
import { Store } from '@tauri-apps/plugin-store';

/**
 * 从后端取得配置文件的绝对路径（单一来源：用户配置目录 appConfigDir）。
 *
 * 前端所有持久化 Store 都应通过此处取得路径，与后端 `settings.rs` 的
 * `config_file_path` 解析到同一文件，避免各自拼路径导致两端落点不一致
 * （Linux 下 `~/.config` 与 `~/.local/share` 不同时会写入与读取错位）。
 */
const getConfigFile = (filename: string): Promise<string> =>
  invoke<string>('config_file_path_command', { filename });

/**
 * 按文件名加载位于用户配置目录的持久化 Store。
 *
 * 路径由后端统一解析，前端无需关心 `appConfigDir` 等细节。
 */
export const loadConfigStore = (filename: string): Promise<Store> =>
  getConfigFile(filename).then((path) => Store.load(path));
