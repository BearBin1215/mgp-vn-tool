import { convertFileSrc } from '@tauri-apps/api/core';
import { useSettingsStore } from '@/stores/settings-store';

/** 应用背景组件，由背景图层和遮罩层组成，绝对定位铺满视口，z-index 低于内容区 */
export default function Background() {
  const backgroundImage = useSettingsStore((s) => s.backgroundImage);
  const backgroundImageTransparency = useSettingsStore((s) => s.backgroundImageTransparency);
  const colorMode = useSettingsStore((s) => s.colorMode);

  // 无背景图片时遮罩完全不透明以提供基础背景色，有背景图片时按透明度参数遮罩
  const alpha = backgroundImage ? backgroundImageTransparency / 100 : 1;
  const maskColor = colorMode === 'dark' ? `rgb(0 0 0 / ${alpha})` : `rgb(255 255 255 / ${alpha})`;

  return (
    <>
      {backgroundImage && (
        <div
          className='pointer-events-none absolute inset-0 z-0 bg-cover bg-center bg-no-repeat'
          style={{ backgroundImage: `url('${convertFileSrc(backgroundImage)}')` }}
        />
      )}
      <div
        className='pointer-events-none absolute inset-0 z-[1]'
        style={{ background: maskColor }}
      />
    </>
  );
}
