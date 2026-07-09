import { useState } from 'react';
import { Card, Button, Typography, Space, Select, Popover, Input, InputNumber } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useSettingsStore } from '@/stores/settingsStore';
import { useMoegirlStore } from '@/stores/moegirlStore';
import { groupLabels } from '@/lib/moegirlDict';
import type { MoegirlHost } from '@/lib/types';
import MoegirlLoginDialog from './MoegirlLoginDialog';
import SettingItem from './SettingItem';

/** 萌娘百科设置 */
export default function MoegirlSettings() {
  const moegirlApiHost = useSettingsStore((s) => s.moegirlApiHost);
  const setMoegirlApiHost = useSettingsStore((s) => s.setMoegirlApiHost);
  const moegirlJumpHost = useSettingsStore((s) => s.moegirlJumpHost);
  const setMoegirlJumpHost = useSettingsStore((s) => s.setMoegirlJumpHost);
  const moegirlUserAgent = useSettingsStore((s) => s.moegirlUserAgent);
  const setMoegirlUserAgent = useSettingsStore((s) => s.setMoegirlUserAgent);
  const moegirlRetries = useSettingsStore((s) => s.moegirlRetries);
  const setMoegirlRetries = useSettingsStore((s) => s.setMoegirlRetries);
  const moegirlRetryDelay = useSettingsStore((s) => s.moegirlRetryDelay);
  const setMoegirlRetryDelay = useSettingsStore((s) => s.setMoegirlRetryDelay);
  const moegirlUsername = useSettingsStore((s) => s.moegirlUsername);
  const moegirlGroups = useMoegirlStore((s) => s.groups);
  const moegirlRights = useMoegirlStore((s) => s.rights);
  const logoutMoegirl = useSettingsStore((s) => s.logoutMoegirl);

  const [loginDialogOpen, setLoginDialogOpen] = useState(false);

  return (
    <>
      <Card title='萌娘百科' id='network-section'>
        <div className='flex flex-col gap-4'>
          <SettingItem
            label='登录账号'
            description='用于请求萌娘百科API，建议使用机器人账号登录（如果有）'
            help='目前而言，仅机器人等拥有API高限制的账号、或维护姬等拥有特定页面查看权限的账号有用，普通账号登录无影响'
          >
            {moegirlUsername ? (
              <Space>
                <Typography.Text type='secondary'>{moegirlUsername}</Typography.Text>
                <Popover
                  content={
                    <div className='max-w-175'>
                      <div><b>用户组：</b>{moegirlGroups.filter((g) => g !== '*').map((g) => groupLabels[g] || g).join('，') || '无'}</div>
                      <div><b>权限：</b>{moegirlRights.join(', ') || '无'}</div>
                    </div>
                  }
                  trigger='hover'
                >
                  <InfoCircleOutlined className='cursor-pointer' />
                </Popover>
                <Button danger onClick={() => logoutMoegirl()}>退出</Button>
              </Space>
            ) : (
              <Button type='primary' onClick={() => setLoginDialogOpen(true)}>登录</Button>
            )}
          </SettingItem>
          <SettingItem label='请求地址' description='请求萌娘百科 API 的域名'>
            <Select
              className='w-60!'
              value={moegirlApiHost}
              onChange={(v) => setMoegirlApiHost(v)}
              options={[
                { value: 'zh.moegirl.org.cn', label: 'zh.moegirl.org.cn' },
                { value: 'mzh.moegirl.org.cn', label: 'mzh.moegirl.org.cn' },
              ]}
            />
          </SettingItem>
          <SettingItem label='跳转地址' description='点击萌百链接时跳转的域名'>
            <Select
              className='w-60!'
              value={moegirlJumpHost}
              onChange={(v) => setMoegirlJumpHost(v as MoegirlHost | 'same')}
              options={[
                { value: 'same', label: '和请求地址一致' },
                { value: 'zh.moegirl.org.cn', label: 'zh.moegirl.org.cn' },
                { value: 'mzh.moegirl.org.cn', label: 'mzh.moegirl.org.cn' },
              ]}
            />
          </SettingItem>
          <SettingItem label='请求重试' description='请求失败时的重试次数和间隔'>
            <div className='flex gap-1'>
              <InputNumber
                className='w-22!'
                min={0}
                max={10}
                precision={0}
                controls={false}
                value={moegirlRetries}
                onChange={(v) => v !== null && setMoegirlRetries(v)}
                suffix='次'
              />
              <InputNumber
                className='w-37!'
                min={100}
                max={30000}
                precision={0}
                controls={false}
                value={moegirlRetryDelay}
                onChange={(v) => v !== null && setMoegirlRetryDelay(v)}
                prefix='间隔'
                suffix='ms'
              />
            </div>
          </SettingItem>
          <SettingItem label='User-Agent' description='请求萌娘百科时使用的 User-Agent'>
            <Input
              className='w-60!'
              value={moegirlUserAgent}
              onChange={(e) => setMoegirlUserAgent(e.target.value)}
              allowClear
            />
          </SettingItem>
        </div>
      </Card>

      <MoegirlLoginDialog
        open={loginDialogOpen}
        onClose={() => setLoginDialogOpen(false)}
      />
    </>
  );
}
