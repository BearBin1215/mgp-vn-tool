import { convertFileSrc } from '@tauri-apps/api/core';
import { useSettingsStore } from '@/stores/settings-store';

/** 应用背景图片组件，绝对定位铺满视口，z-index 低于内容区 */
export default function Background() {
  const backgroundImage = useSettingsStore((s) => s.backgroundImage);

  if (!backgroundImage) {
    return null;
  }

  const url = convertFileSrc(backgroundImage);

  return (
    <div
      className='pointer-events-none absolute inset-0 z-0 bg-cover bg-center bg-no-repeat'
      style={{ backgroundImage: `url('${url}')` }}
    />
  );
}
