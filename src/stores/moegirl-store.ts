import { create } from 'zustand';
import moegirl, { type UserInfo } from '@/api/moegirl';
import { loadConfigStore } from '@/lib/config-store';

interface MoegirlStore extends UserInfo {
  /** 登录后获取用户信息 */
  fetchUserInfo: () => Promise<void>;
  /** 清空用户信息 */
  clearUserInfo: () => Promise<void>;
}

const storePromise = loadConfigStore('moegirl.json');

export const useMoegirlStore = create<MoegirlStore>((set) => ({
  groups: [],
  rights: [],
  displayname: null,
  displaytag: null,

  fetchUserInfo: async () => {
    const { groups, rights, displayname, displaytag } = await moegirl.getUserRights();

    const store = await storePromise;
    await store.set('groups', groups);
    await store.set('rights', rights);
    await store.set('displayname', displayname);
    await store.set('displaytag', displaytag);
    await store.save();

    set({ groups, rights, displayname, displaytag });
  },

  clearUserInfo: async () => {
    const store = await storePromise;
    await store.set('groups', []);
    await store.set('rights', []);
    await store.set('displayname', null);
    await store.set('displaytag', null);
    await store.save();
    set({ groups: [], rights: [], displayname: null, displaytag: null });
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
  const displayname = (await store.get<string | null>('displayname')) ?? null;
  const displaytag = (await store.get<string | null>('displaytag')) ?? null;
  useMoegirlStore.setState({ groups, rights, displayname, displaytag });
};
