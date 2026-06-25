import { useState } from 'react';
import { Card, Input, Radio } from 'antd';
import { useSettingsStore } from '@/stores/settingsStore';
import SettingItem from './SettingItem';

/** 界面设置 */
export default function InterfaceSettings() {
  const colorMode = useSettingsStore((s) => s.colorMode);
  const setColorMode = useSettingsStore((s) => s.setColorMode);
  const uiFont = useSettingsStore((s) => s.uiFont);
  const setUiFont = useSettingsStore((s) => s.setUiFont);
  const codeFont = useSettingsStore((s) => s.codeFont);
  const setCodeFont = useSettingsStore((s) => s.setCodeFont);

  const [uiFontDraft, setUiFontDraft] = useState(uiFont);
  const [codeFontDraft, setCodeFontDraft] = useState(codeFont);

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
      </div>
    </Card>
  );
}
