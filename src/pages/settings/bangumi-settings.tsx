import { Card, InputNumber } from 'antd';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/stores/settings-store';
import SettingItem from './setting-item';

/** Bangumi 设置 */
export default function BangumiSettings() {
  const { t } = useTranslation();
  const bangumiTimeout = useSettingsStore((s) => s.bangumiTimeout);
  const setBangumiTimeout = useSettingsStore((s) => s.setBangumiTimeout);
  const bangumiRetries = useSettingsStore((s) => s.bangumiRetries);
  const setBangumiRetries = useSettingsStore((s) => s.setBangumiRetries);
  const bangumiRetryDelay = useSettingsStore((s) => s.bangumiRetryDelay);
  const setBangumiRetryDelay = useSettingsStore((s) => s.setBangumiRetryDelay);

  return (
    <Card title='Bangumi'>
      <div className='flex flex-col gap-4'>
        <SettingItem
          label={t('请求超时')}
          description={t('Bangumi 网络波动较多，适当调大可减少偶发超时')}
        >
          <InputNumber
            className='w-60!'
            min={1}
            max={120}
            precision={0}
            value={bangumiTimeout}
            onChange={(v) => v !== null && setBangumiTimeout(v)}
            suffix='s'
          />
        </SettingItem>
        <SettingItem
          label={t('请求重试')}
          description={t('请求失败时自动重试的次数和间隔')}
        >
          <div className='flex gap-1'>
            <InputNumber
              className='w-22!'
              min={0}
              max={10}
              precision={0}
              controls={false}
              value={bangumiRetries}
              onChange={(v) => v !== null && setBangumiRetries(v)}
              suffix={t('次')}
            />
            <InputNumber
              className='w-37!'
              min={100}
              max={30000}
              precision={0}
              controls={false}
              value={bangumiRetryDelay}
              onChange={(v) => v !== null && setBangumiRetryDelay(v)}
              prefix={t('间隔')}
              suffix='ms'
            />
          </div>
        </SettingItem>
      </div>
    </Card>
  );
}
