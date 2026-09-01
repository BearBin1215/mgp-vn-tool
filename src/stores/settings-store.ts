import { create } from 'zustand';
import { getCurrentWindow } from '@tauri-apps/api/window';
import moegirl from '@/api/moegirl';
import { DEFAULT_USER_AGENT, DEFAULT_FEISHU_APP_ID } from '@/utils/constants';
import { isErogamescapeUrl, type ErogamescapeUrl, type MoegirlHost } from '@/lib/types';
import { loadConfigStore } from '@/lib/config-store';
import { useMoegirlStore } from './moegirl-store';

export type ColorMode = 'light' | 'dark';

/** 应用设置状态 */
interface SettingsStore {
  /** 当前颜色模式 */
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  /** 界面字体（CSS font-family 值） */
  uiFont: string;
  setUiFont: (font: string) => void;
  /** 代码块字体（CSS font-family 值） */
  codeFont: string;
  setCodeFont: (font: string) => void;
  /** 背景图片文件路径，空字符串表示未设置 */
  backgroundImage: string;
  setBackgroundImage: (path: string) => void;
  /** 背景图片透明度（0-100，数值越大背景图片越透明） */
  backgroundImageTransparency: number;
  setBackgroundImageTransparency: (value: number) => void;
  /** 实时预览背景图片透明度（仅更新内存状态，不写入持久化存储） */
  previewBackgroundImageTransparency: (value: number) => void;
  /** 萌娘百科 API 域名前缀 */
  moegirlApiHost: MoegirlHost;
  setMoegirlApiHost: (host: MoegirlHost) => void;
  /** 萌娘百科跳转域名前缀（'same' 表示与请求域名一致） */
  moegirlJumpHost: MoegirlHost | 'same';
  setMoegirlJumpHost: (host: MoegirlHost | 'same') => void;
  /** 萌娘百科请求 User-Agent */
  moegirlUserAgent: string;
  setMoegirlUserAgent: (ua: string) => void;
  /** 批评空间主机地址 */
  erogamescapeUrl: ErogamescapeUrl;
  setErogamescapeHost: (host: ErogamescapeUrl) => void;
  /** 批评空间账号 */
  erogamescapeUsername: string;
  setErogamescapeUsername: (username: string) => void;
  /** 批评空间密码 */
  erogamescapePassword: string;
  setErogamescapePassword: (password: string) => void;
  /** 批评空间请求超时时长（秒） */
  erogamescapeTimeout: number;
  setErogamescapeTimeout: (seconds: number) => void;
  /** Bangumi 请求超时时长（秒） */
  bangumiTimeout: number;
  setBangumiTimeout: (seconds: number) => void;
  /** Bangumi 请求重试次数 */
  bangumiRetries: number;
  setBangumiRetries: (n: number) => void;
  /** Bangumi 请求重试间隔（毫秒） */
  bangumiRetryDelay: number;
  setBangumiRetryDelay: (ms: number) => void;
  /** 萌娘百科请求重试次数 */
  moegirlRetries: number;
  setMoegirlRetries: (n: number) => void;
  /** 萌娘百科请求重试间隔（毫秒） */
  moegirlRetryDelay: number;
  setMoegirlRetryDelay: (ms: number) => void;
  /** 萌娘百科登录用户名（未登录为空） */
  moegirlUsername: string;
  /** 登录萌娘百科 */
  loginMoegirl: (username: string, password: string) => Promise<void>;
  /** 登出萌娘百科 */
  logoutMoegirl: () => Promise<void>;
  /** Galgame 统计表应用 App ID */
  feishuStatsTableAppId: string;
  setFeishuStatsTableAppId: (id: string) => void;
  /** Galgame 统计表应用 App Secret */
  feishuStatsTableAppSecret: string;
  setFeishuStatsTableAppSecret: (secret: string) => void;
  /** 条目统计页每页条数 */
  articlePageSize: number;
  setArticlePageSize: (size: number) => void;
}

/** Tauri store 实例（路径由后端统一解析到用户配置目录） */
const storePromise = loadConfigStore('settings.json');

/** 从 Tauri store 读取设置；校验失败或未保存时返回默认值。 */
const readSetting = async <T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => boolean = (value) => value !== undefined && value !== null,
): Promise<T> => {
  const store = await storePromise;
  const saved = await store.get<unknown>(key);
  return isValid(saved) ? saved as T : fallback;
};

/** 将设置写入 Tauri store 并保存。 */
const persistSetting = async (key: string, value: unknown): Promise<void> => {
  const store = await storePromise;
  await store.set(key, value);
  await store.save();
};

/** 检查值是否为有限数字。 */
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
/** 检查值是否为非空字符串。 */
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** 批评空间默认地址 */
const DEFAULT_EROGAMESCAPE_URL: ErogamescapeUrl = 'http://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki';

/**
 * 归一化批评空间地址
 *
 * 历史版本存储的地址可能带尾斜杠，裁剪后匹配白名单；无法匹配时回退默认值。
 */
const normalizeErogamescapeUrl = (value: string): ErogamescapeUrl => {
  const trimmed = value.replace(/\/+$/, '') as ErogamescapeUrl;
  return isErogamescapeUrl(trimmed) ? trimmed : DEFAULT_EROGAMESCAPE_URL;
};

/** 应用设置 store，持久化到 Tauri store */
export const useSettingsStore = create<SettingsStore>((set) => ({
  colorMode: 'light',
  moegirlUsername: '',
  feishuStatsTableAppId: DEFAULT_FEISHU_APP_ID,
  feishuStatsTableAppSecret: '',
  articlePageSize: 100,
  backgroundImage: '',
  setBackgroundImage: async (path) => {
    await persistSetting('backgroundImage', path);
    set({ backgroundImage: path });
  },
  backgroundImageTransparency: 90,
  setBackgroundImageTransparency: async (value) => {
    await persistSetting('backgroundImageTransparency', value);
    set({ backgroundImageTransparency: value });
  },
  previewBackgroundImageTransparency: (value) => set({ backgroundImageTransparency: value }),
  setColorMode: async (mode) => {
    await persistSetting('colorMode', mode);
    await getCurrentWindow().setTheme(mode);
    set({ colorMode: mode });
  },

  uiFont: '',
  setUiFont: async (font) => {
    await persistSetting('uiFont', font);
    set({ uiFont: font });
  },

  codeFont: '',
  setCodeFont: async (font) => {
    await persistSetting('codeFont', font);
    set({ codeFont: font });
  },

  erogamescapeUrl: DEFAULT_EROGAMESCAPE_URL,
  setErogamescapeHost: async (host) => {
    await persistSetting('erogamescapeUrl', host);
    set({ erogamescapeUrl: host });
  },
  erogamescapeUsername: '',
  setErogamescapeUsername: async (username) => {
    await persistSetting('erogamescapeUsername', username);
    set({ erogamescapeUsername: username });
  },
  erogamescapePassword: '',
  setErogamescapePassword: async (password) => {
    await persistSetting('erogamescapePassword', password);
    set({ erogamescapePassword: password });
  },
  erogamescapeTimeout: 30,
  setErogamescapeTimeout: async (seconds) => {
    await persistSetting('erogamescapeTimeout', seconds);
    set({ erogamescapeTimeout: seconds });
  },

  bangumiTimeout: 30,
  setBangumiTimeout: async (seconds) => {
    await persistSetting('bangumiTimeout', seconds);
    set({ bangumiTimeout: seconds });
  },

  bangumiRetries: 2,
  setBangumiRetries: async (n) => {
    await persistSetting('bangumiRetries', n);
    set({ bangumiRetries: n });
  },

  bangumiRetryDelay: 1000,
  setBangumiRetryDelay: async (ms) => {
    await persistSetting('bangumiRetryDelay', ms);
    set({ bangumiRetryDelay: ms });
  },

  moegirlApiHost: 'mzh.moegirl.org.cn',
  setMoegirlApiHost: async (host) => {
    await persistSetting('moegirlApiHost', host);
    set({ moegirlApiHost: host });
  },

  moegirlJumpHost: 'same',
  setMoegirlJumpHost: async (host) => {
    await persistSetting('moegirlJumpHost', host);
    set({ moegirlJumpHost: host });
  },

  moegirlUserAgent: DEFAULT_USER_AGENT,
  setMoegirlUserAgent: async (ua) => {
    await persistSetting('moegirlUserAgent', ua);
    set({ moegirlUserAgent: ua });
  },

  moegirlRetries: 1,
  setMoegirlRetries: async (n) => {
    await persistSetting('moegirlRetries', n);
    set({ moegirlRetries: n });
  },

  moegirlRetryDelay: 1000,
  setMoegirlRetryDelay: async (ms) => {
    await persistSetting('moegirlRetryDelay', ms);
    set({ moegirlRetryDelay: ms });
  },

  loginMoegirl: async (username, password) => {
    const loginRes = await moegirl.postWithToken('login', {
      action: 'clientlogin',
      loginreturnurl: 'https://mzh.moegirl.org.cn/api.php',
      username,
      password,
      rememberMe: '1',
    });

    const res = loginRes as Record<string, unknown>;
    const clientlogin = res?.clientlogin as { status?: string; username?: string; message?: string } | undefined;
    const error = res?.error as { info?: string } | undefined;

    if (clientlogin?.status === 'PASS') {
      const name = clientlogin.username || username;
      set({ moegirlUsername: name });
      void useMoegirlStore.getState().fetchUserInfo();
    } else {
      throw new Error(error?.info || clientlogin?.message || '登录失败');
    }
  },

  logoutMoegirl: async () => {
    await moegirl.logout();
    useMoegirlStore.getState().clearUserInfo();
    set({ moegirlUsername: '' });
  },

  setFeishuStatsTableAppId: async (id) => {
    await persistSetting('feishuStatsTableAppId', id);
    set({ feishuStatsTableAppId: id });
  },

  setFeishuStatsTableAppSecret: async (secret) => {
    await persistSetting('feishuStatsTableAppSecret', secret);
    set({ feishuStatsTableAppSecret: secret });
  },

  setArticlePageSize: async (size) => {
    await persistSetting('articlePageSize', size);
    set({ articlePageSize: size });
  },
}));

/** 从 Tauri store 加载保存的设置并更新 zustand store */
export const initSettings = async () => {
  const store = await storePromise;
  const [
    colorMode,
    uiFont,
    codeFont,
    backgroundImage,
    backgroundImageTransparency,
    erogamescapeUrl,
    erogamescapeTimeout,
    bangumiTimeout,
    bangumiRetries,
    bangumiRetryDelay,
    moegirlApiHost,
    moegirlJumpHost,
    feishuStatsTableAppId,
    feishuStatsTableAppSecret,
    articlePageSize,
    moegirlUserAgent,
    moegirlRetries,
    moegirlRetryDelay,
  ] = await Promise.all([
    readSetting<ColorMode>('colorMode', 'light', (v): v is ColorMode => v === 'light' || v === 'dark'),
    readSetting('uiFont', '', isNonEmptyString),
    readSetting('codeFont', '', isNonEmptyString),
    readSetting('backgroundImage', '', isNonEmptyString),
    readSetting('backgroundImageTransparency', 90, isFiniteNumber),
    readSetting('erogamescapeUrl', DEFAULT_EROGAMESCAPE_URL, isNonEmptyString).then(normalizeErogamescapeUrl),
    readSetting('erogamescapeTimeout', 30, isFiniteNumber),
    readSetting('bangumiTimeout', 30, isFiniteNumber),
    readSetting('bangumiRetries', 2, isFiniteNumber),
    readSetting('bangumiRetryDelay', 1000, isFiniteNumber),
    readSetting<MoegirlHost>('moegirlApiHost', 'mzh.moegirl.org.cn', isNonEmptyString),
    readSetting<MoegirlHost | 'same'>('moegirlJumpHost', 'same', isNonEmptyString),
    readSetting('feishuStatsTableAppId', DEFAULT_FEISHU_APP_ID, isNonEmptyString),
    readSetting('feishuStatsTableAppSecret', '', isNonEmptyString),
    readSetting('articlePageSize', 100, isFiniteNumber),
    readSetting('moegirlUserAgent', DEFAULT_USER_AGENT, isNonEmptyString),
    readSetting('moegirlRetries', 1, isFiniteNumber),
    readSetting('moegirlRetryDelay', 1000, isFiniteNumber),
  ]);
  const [erogamescapeUsername, erogamescapePassword, moegirlUsername] = await Promise.all([
    store.get<string>('erogamescapeUsername').then((v) => v || ''),
    store.get<string>('erogamescapePassword').then((v) => v || ''),
    moegirl.checkLogin().then((v) => v || ''),
  ]);
  useSettingsStore.setState({
    colorMode,
    uiFont,
    codeFont,
    backgroundImage,
    backgroundImageTransparency,
    erogamescapeUrl,
    erogamescapeTimeout,
    bangumiTimeout,
    bangumiRetries,
    bangumiRetryDelay,
    erogamescapeUsername,
    erogamescapePassword,
    moegirlApiHost,
    moegirlJumpHost,
    moegirlUsername,
    feishuStatsTableAppId,
    feishuStatsTableAppSecret,
    articlePageSize,
    moegirlUserAgent,
    moegirlRetries,
    moegirlRetryDelay,
  });
};
