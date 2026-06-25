import { create } from 'zustand';
import { Store } from '@tauri-apps/plugin-store';
import { appConfigDir, join } from '@tauri-apps/api/path';
import moegirl from '@/api/moegirl';

interface MoegirlStore {
  /** 用户组 */
  groups: string[];
  /** 用户权限 */
  rights: string[];
  /** 登录后获取用户信息 */
  fetchUserInfo: () => Promise<void>;
  /** 清空用户信息 */
  clearUserInfo: () => Promise<void>;
}

const getStorePath = async (): Promise<string> => {
  const configDir = await appConfigDir();
  return await join(configDir, 'moegirl.json');
};

const storePromise = getStorePath().then((path) => Store.load(path));

export const useMoegirlStore = create<MoegirlStore>((set) => ({
  groups: [],
  rights: [],

  fetchUserInfo: async () => {
    const { groups, rights } = await moegirl.getUserRights();

    const store = await storePromise;
    await store.set('groups', groups);
    await store.set('rights', rights);
    await store.save();

    set({ groups, rights });
  },

  clearUserInfo: async () => {
    const store = await storePromise;
    await store.set('groups', []);
    await store.set('rights', []);
    await store.save();
    set({ groups: [], rights: [] });
  },
}));

/**
 * 从 Tauri store 加载 moegirl 用户数据
 * @param isLoggedIn 当前是否已登录，未登录时清空可能残留的过期数据
 */
export const initMoegirlData = async (isLoggedIn: boolean) => {
  if (!isLoggedIn) {
    await useMoegirlStore.getState().clearUserInfo();
    return;
  }
  const store = await storePromise;
  const groups = (await store.get<string[]>('groups')) || [];
  const rights = (await store.get<string[]>('rights')) || [];
  useMoegirlStore.setState({ groups, rights });
};
