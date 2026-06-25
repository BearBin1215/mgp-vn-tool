import { create } from 'zustand';
import { Store } from '@tauri-apps/plugin-store';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { appConfigDir, join } from '@tauri-apps/api/path';
import moegirl from '@/api/moegirl';
import { DEFAULT_FEISHU_APP_ID } from '@/utils/constants';
import { type ErogamescapeUrl, type MoegirlHost } from '@/lib/types';
import { useMoegirlStore } from './moegirlStore';

export type ColorMode = 'light' | 'dark';

/** 应用设置状态 */
interface SettingsStore {
  /** 当前颜色模式 */
  colorMode: ColorMode;
  /** 设置颜色模式 */
  setColorMode: (mode: ColorMode) => void;
  /** 界面字体（CSS font-family 值） */
  uiFont: string;
  /** 设置界面字体 */
  setUiFont: (font: string) => void;
  /** 代码块字体（CSS font-family 值） */
  codeFont: string;
  /** 设置代码块字体 */
  setCodeFont: (font: string) => void;
  /** 萌娘百科 API 域名前缀 */
  moegirlApiHost: MoegirlHost;
  /** 设置萌娘百科 API 域名前缀 */
  setMoegirlApiHost: (host: MoegirlHost) => void;
  /** 萌娘百科跳转域名前缀（'same' 表示与请求域名一致） */
  moegirlJumpHost: MoegirlHost | 'same';
  /** 设置萌娘百科跳转域名前缀 */
  setMoegirlJumpHost: (host: MoegirlHost | 'same') => void;
  /** 萌娘百科请求 User-Agent */
  moegirlUserAgent: string;
  /** 设置萌娘百科请求 User-Agent */
  setMoegirlUserAgent: (ua: string) => void;
  /** 批评空间主机地址 */
  erogamescapeUrl: ErogamescapeUrl;
  /** 设置批评空间地址 */
  setErogamescapeHost: (host: ErogamescapeUrl) => void;
  /** 批评空间账号 */
  erogamescapeUsername: string;
  /** 设置批评空间账号 */
  setErogamescapeUsername: (username: string) => void;
  /** 批评空间密码 */
  erogamescapePassword: string;
  /** 设置批评空间密码 */
  setErogamescapePassword: (password: string) => void;
  /** 批评空间请求超时时长（秒） */
  erogamescapeTimeout: number;
  /** 设置批评空间请求超时时长 */
  setErogamescapeTimeout: (seconds: number) => void;
  /** 萌娘百科请求重试次数 */
  moegirlRetries: number;
  /** 设置萌娘百科请求重试次数 */
  setMoegirlRetries: (n: number) => void;
  /** 萌娘百科请求重试间隔（毫秒） */
  moegirlRetryDelay: number;
  /** 设置萌娘百科请求重试间隔 */
  setMoegirlRetryDelay: (ms: number) => void;
  /** 萌娘百科登录用户名（未登录为空） */
  moegirlUsername: string;
  /** 登录萌娘百科 */
  loginMoegirl: (username: string, password: string) => Promise<void>;
  /** 登出萌娘百科 */
  logoutMoegirl: () => Promise<void>;
  /** Galgame 统计表应用 App ID */
  feishuStatsTableAppId: string;
  /** 设置 Galgame 统计表应用 App ID */
  setFeishuStatsTableAppId: (id: string) => void;
  /** Galgame 统计表应用 App Secret */
  feishuStatsTableAppSecret: string;
  /** 设置 Galgame 统计表应用 App Secret */
  setFeishuStatsTableAppSecret: (secret: string) => void;
  /** 条目统计页每页条数 */
  articlePageSize: number;
  /** 设置条目统计页每页条数 */
  setArticlePageSize: (size: number) => void;
}

/** 获取用户配置目录下的 settings.json 路径 */
const getStorePath = async (): Promise<string> => {
  const configDir = await appConfigDir();
  return await join(configDir, 'settings.json');
};

/** Tauri store 实例（保存在用户配置目录） */
const storePromise = getStorePath().then((path) => Store.load(path));

/** 从 Tauri store 读取保存的颜色模式 */
const getInitialColorMode = async (): Promise<ColorMode> => {
  const store = await storePromise;
  const saved = await store.get<ColorMode>('colorMode');
  return saved === 'light' || saved === 'dark' ? saved : 'light';
};

/** 从 Tauri store 读取保存的界面字体 */
const getInitialUiFont = async (): Promise<string> => {
  const store = await storePromise;
  return (await store.get<string>('uiFont')) || '';
};

/** 从 Tauri store 读取保存的代码块字体 */
const getInitialCodeFont = async (): Promise<string> => {
  const store = await storePromise;
  return (await store.get<string>('codeFont')) || '';
};

/** 从 Tauri store 读取保存的批评空间地址 */
const getInitialErogamescapeHost = async (): Promise<ErogamescapeUrl> => {
  const store = await storePromise;
  const saved = await store.get<ErogamescapeUrl>('erogamescapeUrl');
  return saved || 'http://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki';
};

/** 从 Tauri store 读取保存的萌百请求地址设置 */
const getInitialMoegirlApiHost = async (): Promise<MoegirlHost> => {
  const store = await storePromise;
  const saved = await store.get<MoegirlHost>('moegirlApiHost');
  return saved || 'mzh.moegirl.org.cn';
};

/** 从 Tauri store 读取保存的萌百跳转地址设置 */
const getInitialMoegirlJumpHost = async (): Promise<MoegirlHost | 'same'> => {
  const store = await storePromise;
  const saved = await store.get<MoegirlHost | 'same'>('moegirlJumpHost');
  return saved || 'same';
};

const DEFAULT_MOEGIRL_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/** 从 Tauri store 读取保存的萌百 User-Agent 设置 */
const getInitialMoegirlUserAgent = async (): Promise<string> => {
  const store = await storePromise;
  return (await store.get<string>('moegirlUserAgent')) || DEFAULT_MOEGIRL_USER_AGENT;
};

/** 从 Tauri store 读取保存的萌百请求重试次数 */
const getInitialMoegirlRetries = async (): Promise<number> => {
  const store = await storePromise;
  const saved = await store.get<number>('moegirlRetries');
  return typeof saved === 'number' && Number.isFinite(saved) ? saved : 1;
};

/** 从 Tauri store 读取保存的萌百请求重试间隔 */
const getInitialMoegirlRetryDelay = async (): Promise<number> => {
  const store = await storePromise;
  const saved = await store.get<number>('moegirlRetryDelay');
  return typeof saved === 'number' && Number.isFinite(saved) ? saved : 1000;
};

/** 从 Tauri store 读取保存的批评空间请求超时时长 */
const getInitialErogamescapeTimeout = async (): Promise<number> => {
  const store = await storePromise;
  const saved = await store.get<number>('erogamescapeTimeout');
  return typeof saved === 'number' && Number.isFinite(saved) ? saved : 20;
};

/** 从 Tauri store 读取保存的 Galgame 统计表应用 App ID */
const getInitialFeishuStatsTableAppId = async (): Promise<string> => {
  const store = await storePromise;
  return (await store.get<string>('feishuStatsTableAppId')) || DEFAULT_FEISHU_APP_ID;
};

/** 从 Tauri store 读取保存的 Galgame 统计表应用 App Secret */
const getInitialFeishuStatsTableAppSecret = async (): Promise<string> => {
  const store = await storePromise;
  return (await store.get<string>('feishuStatsTableAppSecret')) || '';
};

/** 从 Tauri store 读取保存的条目统计页每页条数 */
const getInitialArticlePageSize = async (): Promise<number> => {
  const store = await storePromise;
  const saved = await store.get<number>('articlePageSize');
  return typeof saved === 'number' && Number.isFinite(saved) ? saved : 100;
};

/** 应用设置 store，持久化到 Tauri store */
export const useSettingsStore = create<SettingsStore>((set) => ({
  colorMode: 'light',
  moegirlUsername: '',
  feishuStatsTableAppId: DEFAULT_FEISHU_APP_ID,
  feishuStatsTableAppSecret: '',
  articlePageSize: 100,
  setColorMode: async (mode) => {
    const store = await storePromise;
    await store.set('colorMode', mode);
    await store.save();
    await getCurrentWindow().setTheme(mode);
    set({ colorMode: mode });
  },

  uiFont: '',
  setUiFont: async (font) => {
    const store = await storePromise;
    await store.set('uiFont', font);
    await store.save();
    set({ uiFont: font });
  },

  codeFont: '',
  setCodeFont: async (font) => {
    const store = await storePromise;
    await store.set('codeFont', font);
    await store.save();
    set({ codeFont: font });
  },

  erogamescapeUrl: 'http://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki',
  setErogamescapeHost: async (host) => {
    const store = await storePromise;
    await store.set('erogamescapeUrl', host);
    await store.save();
    set({ erogamescapeUrl: host });
  },
  erogamescapeUsername: '',
  setErogamescapeUsername: async (username) => {
    const store = await storePromise;
    await store.set('erogamescapeUsername', username);
    await store.save();
    set({ erogamescapeUsername: username });
  },
  erogamescapePassword: '',
  setErogamescapePassword: async (password) => {
    const store = await storePromise;
    await store.set('erogamescapePassword', password);
    await store.save();
    set({ erogamescapePassword: password });
  },
  erogamescapeTimeout: 20,
  setErogamescapeTimeout: async (seconds) => {
    const store = await storePromise;
    await store.set('erogamescapeTimeout', seconds);
    await store.save();
    set({ erogamescapeTimeout: seconds });
  },

  moegirlApiHost: 'mzh.moegirl.org.cn',
  setMoegirlApiHost: async (host) => {
    const store = await storePromise;
    await store.set('moegirlApiHost', host);
    await store.save();
    set({ moegirlApiHost: host });
  },

  moegirlJumpHost: 'same',
  setMoegirlJumpHost: async (host) => {
    const store = await storePromise;
    await store.set('moegirlJumpHost', host);
    await store.save();
    set({ moegirlJumpHost: host });
  },

  moegirlUserAgent: DEFAULT_MOEGIRL_USER_AGENT,
  setMoegirlUserAgent: async (ua) => {
    const store = await storePromise;
    await store.set('moegirlUserAgent', ua);
    await store.save();
    set({ moegirlUserAgent: ua });
  },

  moegirlRetries: 1,
  setMoegirlRetries: async (n) => {
    const store = await storePromise;
    await store.set('moegirlRetries', n);
    await store.save();
    set({ moegirlRetries: n });
  },

  moegirlRetryDelay: 1000,
  setMoegirlRetryDelay: async (ms) => {
    const store = await storePromise;
    await store.set('moegirlRetryDelay', ms);
    await store.save();
    set({ moegirlRetryDelay: ms });
  },

  loginMoegirl: async (username, password) => {
    const loginRes = await moegirl.postWithToken('login', {
      action: 'clientlogin',
      loginreturnurl: 'https://mzh.moegirl.org.cn/api.php',
      username,
      password,
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
    const store = await storePromise;
    await store.set('feishuStatsTableAppId', id);
    await store.save();
    set({ feishuStatsTableAppId: id });
  },

  setFeishuStatsTableAppSecret: async (secret) => {
    const store = await storePromise;
    await store.set('feishuStatsTableAppSecret', secret);
    await store.save();
    set({ feishuStatsTableAppSecret: secret });
  },

  setArticlePageSize: async (size) => {
    const store = await storePromise;
    await store.set('articlePageSize', size);
    await store.save();
    set({ articlePageSize: size });
  },
}));

/** 从 Tauri store 加载保存的设置并更新 store */
export const initSettings = async () => {
  const store = await storePromise;
  const [colorMode, uiFont, codeFont, erogamescapeUrl, erogamescapeTimeout, moegirlApiHost, moegirlJumpHost, feishuStatsTableAppId, feishuStatsTableAppSecret, articlePageSize, moegirlUserAgent, moegirlRetries, moegirlRetryDelay] = await Promise.all([
    getInitialColorMode(),
    getInitialUiFont(),
    getInitialCodeFont(),
    getInitialErogamescapeHost(),
    getInitialErogamescapeTimeout(),
    getInitialMoegirlApiHost(),
    getInitialMoegirlJumpHost(),
    getInitialFeishuStatsTableAppId(),
    getInitialFeishuStatsTableAppSecret(),
    getInitialArticlePageSize(),
    getInitialMoegirlUserAgent(),
    getInitialMoegirlRetries(),
    getInitialMoegirlRetryDelay(),
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
    erogamescapeUrl,
    erogamescapeTimeout,
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
