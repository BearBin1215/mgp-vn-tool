import { useEffect, useRef, useState } from 'react';
import { Card, Input } from 'antd';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/stores/settings-store';
import SettingItem from './setting-item';

/** 飞书设置 */
export default function FeishuSettings() {
  const { t } = useTranslation();
  const feishuStatsTableAppId = useSettingsStore((s) => s.feishuStatsTableAppId);
  const setFeishuStatsTableAppId = useSettingsStore((s) => s.setFeishuStatsTableAppId);
  const feishuStatsTableAppSecret = useSettingsStore((s) => s.feishuStatsTableAppSecret);
  const setFeishuStatsTableAppSecret = useSettingsStore((s) => s.setFeishuStatsTableAppSecret);

  const [appIdDraft, setAppIdDraft] = useState(feishuStatsTableAppId);
  const [appSecretDraft, setAppSecretDraft] = useState(feishuStatsTableAppSecret);

  // 进入设置页面时，如果`hash`为feishu，滚动到飞书设置部分
  const cardRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useEffect(() => {
    if (location.hash === '#feishu') {
      cardRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [location.hash]);

  return (
    <Card ref={cardRef} title={t('飞书')}>
      <div className='flex flex-col gap-4'>
        <SettingItem label='Galgame 统计表 App ID' description={t('飞书开放平台应用 App ID（找阿熊拿）')}>
          <Input
            className='w-60!'
            value={appIdDraft}
            onChange={(e) => setAppIdDraft(e.target.value)}
            onBlur={() => setFeishuStatsTableAppId(appIdDraft)}
          />
        </SettingItem>
        <SettingItem label={t('Galgame 统计表 App Secret')} description={t('飞书开放平台应用 App Secret（找阿熊拿）')}>
          <Input.Password
            className='w-60!'
            value={appSecretDraft}
            onChange={(e) => setAppSecretDraft(e.target.value)}
            onBlur={() => setFeishuStatsTableAppSecret(appSecretDraft)}
          />
        </SettingItem>
      </div>
    </Card>
  );
}
