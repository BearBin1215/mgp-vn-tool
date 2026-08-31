/**
 * 统一修改项目版本号脚本。
 * 读取命令行参数（显式版本号或递增关键字），计算目标版本号后写入
 * package.json、src-tauri/tauri.conf.json、src-tauri/Cargo.toml、src-tauri/Cargo.lock 四处。
 * 仅修改文件，git commit 与打 tag 由人工执行。
 *
 * 用法：
 *   pnpm bump 1.2.3        指定具体版本号
 *   pnpm bump minor        按关键字递增（major/minor/patch）
 *   pnpm bump preminor     预发布递增（premajor/preminor/prepatch/prerelease）
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import semver from 'semver';

/** 语义化版本递增关键字 */
const RELEASE_TYPES = ['major', 'minor', 'patch', 'premajor', 'preminor', 'prepatch', 'prerelease'] as const;
type ReleaseType = (typeof RELEASE_TYPES)[number];

/** 项目根目录 */
const ROOT = resolve(import.meta.dirname, '..');

/** 需要同步版本号的文件相对路径 */
const FILES = {
  packageJson: 'package.json',
  tauriConf: 'src-tauri/tauri.conf.json',
  cargoToml: 'src-tauri/Cargo.toml',
} as const;

/**
 * 从原始文本中提取首个 `"version": "..."` 的值。
 * 用于读取当前版本号以支持关键字递增。
 */
function extractVersion(content: string): string | null {
  const match = content.match(/"version"\s*:\s*"([^"]*)"/);
  return match?.[1] ?? null;
}

/**
 * 从命令行参数计算目标版本号。
 * 参数为递增关键字时基于 package.json 当前版本递增；
 * 参数为显式版本号时直接校验。不合法则报错退出。
 */
function resolveTargetVersion(): string {
  const arg = process.argv[2];
  if (!arg) {
    console.error('用法：pnpm bump <version|关键字>，例如 pnpm bump 1.2.3 或 pnpm bump minor');
    process.exit(1);
  }

  // 递增关键字：基于当前版本计算
  if (RELEASE_TYPES.includes(arg as ReleaseType)) {
    const current = extractVersion(readFileSync(resolve(ROOT, FILES.packageJson), 'utf8'));
    if (!current) {
      console.error('无法从 package.json 读取当前版本号');
      process.exit(1);
    }
    const next = semver.inc(current, arg as ReleaseType);
    if (!next) {
      console.error(`从 ${current} 按 ${arg} 递增失败`);
      process.exit(1);
    }
    return next;
  }

  // 显式版本号：校验合法性
  // node-semver 会宽松接受 v 前缀和首尾空白，但 Cargo.toml 不接受这些写法。
  if (!semver.valid(arg) || !/^\d/.test(arg) || arg.trim() !== arg) {
    console.error(`版本号格式不合法：${arg}（应为 x.y.z 或 x.y.z-后缀）`);
    process.exit(1);
  }
  return arg;
}

/**
 * 对原始文本做定点替换：仅替换首个 `"version": "..."`，保持文件其余格式不变。
 * 替换失败则报错退出。
 */
function replaceVersionField(content: string, version: string, filePath: string): string {
  let replaced = false;
  const newContent = content.replace(
    /"version"\s*:\s*"[^"]*"/,
    () => {
      replaced = true;
      return `"version": "${version}"`;
    },
  );
  if (!replaced) {
    console.error(`${filePath} 中未找到 version 字段`);
    process.exit(1);
  }
  return newContent;
}

/**
 * 修改指定 JSON 文件的 version 字段并写回（保持原格式）。
 */
function bumpJsonFile(relPath: string, version: string): void {
  const path = resolve(ROOT, relPath);
  writeFileSync(path, replaceVersionField(readFileSync(path, 'utf8'), version, relPath), 'utf8');
}

/**
 * 修改 src-tauri/Cargo.toml 中 [package] 下的 version 字段。
 * 仅替换文件中第一个 `version = "..."` 行（[package] 位于文件顶部，
 * 其 version 必为首个出现），不动依赖项中的 version。
 */
function bumpCargoToml(version: string): void {
  const relPath = FILES.cargoToml;
  const path = resolve(ROOT, relPath);
  const content = readFileSync(path, 'utf8');
  let replaced = false;
  const newContent = content.replace(
    /^version\s*=\s*"[^"]*"/m,
    () => {
      replaced = true;
      return `version = "${version}"`;
    },
  );
  if (!replaced) {
    console.error('Cargo.toml 中未找到 [package] 下的 version 字段');
    process.exit(1);
  }
  writeFileSync(path, newContent, 'utf8');
}

/**
 * 让 Cargo 同步工作区包在 Cargo.lock 中的版本。
 * --workspace 仅更新工作区成员，不会顺带升级第三方依赖；
 * --offline 避免仅修改本包版本时访问依赖注册表。
 */
function updateCargoLock(): void {
  try {
    execFileSync(
      'cargo',
      ['update', '--workspace', '--offline', '--manifest-path', resolve(ROOT, FILES.cargoToml)],
      { cwd: ROOT, stdio: 'inherit' },
    );
  } catch {
    console.error('Cargo.lock 更新失败，请确认 Rust 工具链可用后重试');
    process.exit(1);
  }
}

const version = resolveTargetVersion();
bumpJsonFile(FILES.packageJson, version);
bumpJsonFile(FILES.tauriConf, version);
bumpCargoToml(version);
updateCargoLock();
console.log(`已将版本号统一修改为 ${version}（package.json、tauri.conf.json、Cargo.toml、Cargo.lock）`);
