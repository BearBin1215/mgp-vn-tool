/**
 * 版本号一致性校验脚本。
 * 以传入的 git tag 为基准，校验 tag、package.json、src-tauri/tauri.conf.json、
 * src-tauri/Cargo.toml、src-tauri/Cargo.lock（工作区包）的版本号是否完全一致。
 * CI 在构建发布前运行本脚本，任一处不一致即报错退出，避免产物与 Release 版本错乱。
 *
 * 用法：
 *   pnpm check-version v0.5.0
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'smol-toml';
import semver from 'semver';

/** 项目根目录 */
const ROOT = resolve(import.meta.dirname, '..');

/** 需要校验版本号的文件相对路径，与 bump-version.ts 修改的文件保持一致 */
const FILES = {
  packageJson: 'package.json',
  tauriConf: 'src-tauri/tauri.conf.json',
  cargoToml: 'src-tauri/Cargo.toml',
  cargoLock: 'src-tauri/Cargo.lock',
} as const;

/** 工作区包名，用于在 Cargo.lock 中定位本项目的版本记录 */
const WORKSPACE_PACKAGE = 'mgp-vn-tool';

/**
 * 从 JSON 文件中读取 version 字段。
 * 直接用 JSON.parse 解析整个文件后取字段，不依赖正则匹配。
 */
function readJsonVersion(relPath: string): string | undefined {
  const content = readFileSync(resolve(ROOT, relPath), 'utf8');
  return JSON.parse(content).version;
}

/**
 * 从 Cargo.toml 中读取 [package] 下的 version 字段。
 * 用 smol-toml 解析 TOML 结构后直接取 package.version。
 */
function readCargoTomlVersion(relPath: string): string | undefined {
  const content = readFileSync(resolve(ROOT, relPath), 'utf8');
  const pkg = parse(content).package as { version?: string } | undefined;
  return pkg?.version;
}

/**
 * 从 Cargo.lock 中读取工作区包的 version 字段。
 * Cargo.lock 中 [[package]] 解析为 package 数组，
 * 按包名定位后取 version，避免误读第三方依赖的版本。
 */
function readCargoLockVersion(relPath: string): string | undefined {
  const content = readFileSync(resolve(ROOT, relPath), 'utf8');
  const packages = parse(content).package as Array<{ name: string; version: string }> | undefined;
  return packages?.find(pkg => pkg.name === WORKSPACE_PACKAGE)?.version;
}

/** 从命令行参数解析 tag 版本号 */
function resolveExpectedVersion(): string {
  const tag = process.argv[2];
  if (!tag) {
    console.error('用法：pnpm check-version <tag>，例如 pnpm check-version v0.5.0');
    process.exit(1);
  }

  const version = tag.replace(/^v/, '');
  // semver 会宽松接受 v 前缀，因此先剥前缀再校验，并用 /^\d/ 拦截形如 vv1.0.0 的写法
  if (!tag.startsWith('v') || !semver.valid(version) || !/^\d/.test(version)) {
    console.error(`tag 格式不合法：${tag}（应为 v + 版本号，如 v0.5.0）`);
    process.exit(1);
  }
  return version;
}

const expected = resolveExpectedVersion();
const actual = [
  { file: FILES.packageJson, version: readJsonVersion(FILES.packageJson) },
  { file: FILES.tauriConf, version: readJsonVersion(FILES.tauriConf) },
  { file: FILES.cargoToml, version: readCargoTomlVersion(FILES.cargoToml) },
  { file: FILES.cargoLock, version: readCargoLockVersion(FILES.cargoLock) },
];

// 汇总全部不一致项后一次性报告，方便一次修正所有文件
const problems = actual
  .map(({ file, version }) =>
    version === expected ? null : `${file}: ${version ?? '未找到 version 字段'}`,
  )
  .filter((line): line is string => line !== null);

if (problems.length > 0) {
  console.error(`版本号不一致：tag: ${expected}`);
  for (const line of problems) {
    console.error(`  - ${line}`);
  }
  process.exit(1);
}
console.log('版本号校验通过');
