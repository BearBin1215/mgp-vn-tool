import { create } from 'zustand';
import { getCurrentWindow } from '@tauri-apps/api/window';
import moegirl from '@/api/moegirl';
import { DEFAULT_USER_AGENT, DEFAULT_FEISHU_APP_ID } from '@/utils/constants';
import { type ErogamescapeUrl, type MoegirlHost } from '@/lib/types';
import { loadConfigStore } from '@/lib/configStore';
import { useMoegirlStore } from './moegirlStore';

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

/** 从 Tauri store 读取保存的萌百 User-Agent 设置 */
const getInitialMoegirlUserAgent = async (): Promise<string> => {
  const store = await storePromise;
  return (await store.get<string>('moegirlUserAgent')) || DEFAULT_USER_AGENT;
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
  return typeof saved === 'number' && Number.isFinite(saved) ? saved : 30;
};

/** 从 Tauri store 读取保存的 Bangumi 请求超时时长 */
const getInitialBangumiTimeout = async (): Promise<number> => {
  const store = await storePromise;
  const saved = await store.get<number>('bangumiTimeout');
  return typeof saved === 'number' && Number.isFinite(saved) ? saved : 30;
};

/** 从 Tauri store 读取保存的 Bangumi 请求重试次数 */
const getInitialBangumiRetries = async (): Promise<number> => {
  const store = await storePromise;
  const saved = await store.get<number>('bangumiRetries');
  return typeof saved === 'number' && Number.isFinite(saved) ? saved : 2;
};

/** 从 Tauri store 读取保存的 Bangumi 请求重试间隔 */
const getInitialBangumiRetryDelay = async (): Promise<number> => {
  const store = await storePromise;
  const saved = await store.get<number>('bangumiRetryDelay');
  return typeof saved === 'number' && Number.isFinite(saved) ? saved : 1000;
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

/** 从 Tauri store 读取保存的背景图片路径 */
const getInitialBackgroundImage = async (): Promise<string> => {
  const store = await storePromise;
  return (await store.get<string>('backgroundImage')) || '';
};

/** 从 Tauri store 读取保存的背景图片透明度 */
const getInitialBackgroundImageTransparency = async (): Promise<number> => {
  const store = await storePromise;
  const saved = await store.get<number>('backgroundImageTransparency');
  return typeof saved === 'number' && Number.isFinite(saved) ? saved : 90;
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
    const store = await storePromise;
    await store.set('backgroundImage', path);
    await store.save();
    set({ backgroundImage: path });
  },
  backgroundImageTransparency: 90,
  setBackgroundImageTransparency: async (value) => {
    const store = await storePromise;
    await store.set('backgroundImageTransparency', value);
    await store.save();
    set({ backgroundImageTransparency: value });
  },
  previewBackgroundImageTransparency: (value) => set({ backgroundImageTransparency: value }),
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
  erogamescapeTimeout: 30,
  setErogamescapeTimeout: async (seconds) => {
    const store = await storePromise;
    await store.set('erogamescapeTimeout', seconds);
    await store.save();
    set({ erogamescapeTimeout: seconds });
  },

  bangumiTimeout: 30,
  setBangumiTimeout: async (seconds) => {
    const store = await storePromise;
    await store.set('bangumiTimeout', seconds);
    await store.save();
    set({ bangumiTimeout: seconds });
  },

  bangumiRetries: 1,
  setBangumiRetries: async (n) => {
    const store = await storePromise;
    await store.set('bangumiRetries', n);
    await store.save();
    set({ bangumiRetries: n });
  },

  bangumiRetryDelay: 1000,
  setBangumiRetryDelay: async (ms) => {
    const store = await storePromise;
    await store.set('bangumiRetryDelay', ms);
    await store.save();
    set({ bangumiRetryDelay: ms });
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

  moegirlUserAgent: DEFAULT_USER_AGENT,
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
    getInitialColorMode(),
    getInitialUiFont(),
    getInitialCodeFont(),
    getInitialBackgroundImage(),
    getInitialBackgroundImageTransparency(),
    getInitialErogamescapeHost(),
    getInitialErogamescapeTimeout(),
    getInitialBangumiTimeout(),
    getInitialBangumiRetries(),
    getInitialBangumiRetryDelay(),
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
