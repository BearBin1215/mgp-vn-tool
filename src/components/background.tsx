import { useEffect } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useSettingsStore } from '@/stores/settings-store';

/** 应用背景图片层：固定定位铺满视口，以可见度绘制在主题底色上，可见度同时经 :root 变量驱动各半透明面板联动（见 App.css） */
export default function Background() {
  const backgroundImage = useSettingsStore((s) => s.backgroundImage);
  const backgroundImageTransparency = useSettingsStore((s) => s.backgroundImageTransparency);

  // 背景图片可见度（0-1），与透明度互补；无背景图时为 0
  const visibility = backgroundImage ? 1 - backgroundImageTransparency / 100 : 0;

  useEffect(() => {
    document.documentElement.style.setProperty('--bg-image-visibility', visibility.toFixed(4));
  }, [visibility]);

  if (!backgroundImage) {
    return null;
  }

  // 转义双引号，防止文件路径含引号时 url() 失效
  const url = convertFileSrc(backgroundImage).replaceAll('"', '\\"');

  return (
    <div
      className='pointer-events-none fixed inset-0 z-0 bg-cover bg-center bg-no-repeat'
      style={{ backgroundImage: `url("${url}")`, opacity: visibility }}
    />
  );
}
