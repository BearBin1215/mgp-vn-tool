import { useState } from 'react';
import { App, Button, Card, Input, Radio, Slider } from 'antd';
import { FolderOpenOutlined, DeleteOutlined } from '@ant-design/icons';
import { open } from '@tauri-apps/plugin-dialog';
import { useSettingsStore } from '@/stores/settingsStore';
import SettingItem from './SettingItem';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];

/** 界面设置 */
export default function InterfaceSettings() {
  const { message } = App.useApp();
  const colorMode = useSettingsStore((s) => s.colorMode);
  const setColorMode = useSettingsStore((s) => s.setColorMode);
  const uiFont = useSettingsStore((s) => s.uiFont);
  const setUiFont = useSettingsStore((s) => s.setUiFont);
  const codeFont = useSettingsStore((s) => s.codeFont);
  const setCodeFont = useSettingsStore((s) => s.setCodeFont);
  const backgroundImage = useSettingsStore((s) => s.backgroundImage);
  const setBackgroundImage = useSettingsStore((s) => s.setBackgroundImage);
  const backgroundImageTransparency = useSettingsStore((s) => s.backgroundImageTransparency);
  const setBackgroundImageTransparency = useSettingsStore((s) => s.setBackgroundImageTransparency);
  const previewBackgroundImageTransparency = useSettingsStore((s) => s.previewBackgroundImageTransparency);

  const [uiFontDraft, setUiFontDraft] = useState(uiFont);
  const [codeFontDraft, setCodeFontDraft] = useState(codeFont);

  /** 打开文件选择器选择背景图片 */
  const handleSelectImage = async () => {
    const selected = await open({
      title: '选择背景图片',
      filters: [{
        name: '图片文件',
        extensions: IMAGE_EXTENSIONS,
      }],
      multiple: false,
      directory: false,
    });
    if (selected) {
      setBackgroundImage(selected as string);
    }
  };

  /** 清除背景图片 */
  const handleClearImage = () => {
    setBackgroundImage('');
    message.success('已清除背景图片');
  };

  return (
    <Card title='界面'>
      <div className='flex flex-col gap-4'>
        <SettingItem label='颜色主题'>
          <Radio.Group
            value={colorMode}
            onChange={(e) => setColorMode(e.target.value)}
            optionType='button'
            buttonStyle='solid'
          >
            <Radio.Button value='light'>浅色</Radio.Button>
            <Radio.Button value='dark'>深色</Radio.Button>
          </Radio.Group>
        </SettingItem>
        <SettingItem label='界面字体' description='CSS font-family 值，留空使用默认字体'>
          <Input
            className='w-60!'
            placeholder="如 'Microsoft YaHei', sans-serif"
            value={uiFontDraft}
            onChange={(e) => setUiFontDraft(e.target.value)}
            onBlur={() => setUiFont(uiFontDraft)}
          />
        </SettingItem>
        <SettingItem label='代码字体' description='CSS font-family 值，留空使用默认字体'>
          <Input
            className='w-60!'
            placeholder="如 'JetBrains Mono', Consolas, monospace"
            value={codeFontDraft}
            onChange={(e) => setCodeFontDraft(e.target.value)}
            onBlur={() => setCodeFont(codeFontDraft)}
          />
        </SettingItem>
        <SettingItem label='背景图片'>
          <div className='flex items-center gap-2'>
            <span className='text-sm text-(--ant-color-text-tertiary)'>
              {backgroundImage ? '已设置' : '未设置'}
            </span>
            <Button icon={<FolderOpenOutlined />} onClick={handleSelectImage}>
              {backgroundImage ? '更换' : '选择'}
            </Button>
            {backgroundImage && (
              <Button icon={<DeleteOutlined />} onClick={handleClearImage} />
            )}
          </div>
        </SettingItem>
        <SettingItem label='背景图片透明度'>
          <Slider
            className='w-57! mx-1.5!'
            min={0}
            max={100}
            value={backgroundImageTransparency}
            onChange={(value) => previewBackgroundImageTransparency(value)}
            onChangeComplete={(value) => setBackgroundImageTransparency(value)}
            disabled={!backgroundImage}
            tooltip={{ formatter: (value) => `${value}%` }}
          />
        </SettingItem>
      </div>
    </Card>
  );
}
