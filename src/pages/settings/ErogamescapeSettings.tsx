import { useState } from 'react';
import {
  Card,
  Input,
  InputNumber,
  Select,
  Button,
  Typography,
  Space,
  Modal,
  Tooltip,
  App,
  type ButtonProps,
} from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ApiOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '@/stores/settingsStore';
import SettingItem from './SettingItem';

/** 批评空间设置 */
export default function ErogamescapeSettings() {
  const { message } = App.useApp();
  const erogamescapeUrl = useSettingsStore((s) => s.erogamescapeUrl);
  const setErogamescapeHost = useSettingsStore((s) => s.setErogamescapeHost);
  const erogamescapeUsername = useSettingsStore((s) => s.erogamescapeUsername);
  const setErogamescapeUsername = useSettingsStore((s) => s.setErogamescapeUsername);
  const erogamescapePassword = useSettingsStore((s) => s.erogamescapePassword);
  const setErogamescapePassword = useSettingsStore((s) => s.setErogamescapePassword);
  const erogamescapeTimeout = useSettingsStore((s) => s.erogamescapeTimeout);
  const setErogamescapeTimeout = useSettingsStore((s) => s.setErogamescapeTimeout);

  // 镜像站登录凭证弹窗控制
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState(erogamescapeUsername);
  const [passwordDraft, setPasswordDraft] = useState(erogamescapePassword);

  const [checkResults, setCheckResults] = useState<Record<string, 'success' | 'fail'>>({});
  const [checking, setChecking] = useState(false);

  const currentResult = checkResults[erogamescapeUrl];

  /** 检测批评空间连通性 */
  const testConnectivity = async () => {
    // 镜像站需要携带用户名密码
    if (erogamescapeUrl === 'https://ero.plumz.me' && (!erogamescapeUsername || !erogamescapePassword)) {
      message.warning('请先设置镜像站登录凭证');
      setAuthDialogOpen(true);
      return;
    }
    setChecking(true);
    try {
      const res = await invoke<{ statusCode: string; result: string; response: string }>('check_connectivity');
      setCheckResults((prev) => ({ ...prev, [erogamescapeUrl]: res.result === 'success' ? 'success' : 'fail' }));
      if (res.result === 'success') {
        message.success('连通正常');
      } else {
        message.error(res.statusCode === '0' ? `连接失败：${res.response}` : `无法访问（${res.statusCode}）`);
      }
    } catch {
      setCheckResults((prev) => ({ ...prev, [erogamescapeUrl]: 'fail' }));
      message.error('连接失败');
    } finally {
      setChecking(false);
    }
  };

  /** 检测连通性按钮图标 */
  let icon = <ApiOutlined />;
  /** 检测连通性按钮颜色 */
  let btnColor: ButtonProps['color'] = 'default';

  if (currentResult === 'success') {
    icon = <CheckCircleOutlined />;
    btnColor = 'green';
  } else if (currentResult === 'fail') {
    icon = <CloseCircleOutlined />;
    btnColor = 'danger';
  }

  return (
    <>
      <Card title='批评空间'>
        <div className='flex flex-col gap-4'>
          <SettingItem
            label='访问地址'
            description='从批评空间（erogamescape）读取数据时的访问地址'
            help={<>原站<b>通常</b>需要日本IP或家宽；镜像站仅限国内访问</>}
          >
            <div className='flex gap-1 w-60'>
              <Select
                className='grow'
                value={erogamescapeUrl}
                onChange={setErogamescapeHost}
                options={[
                  { value: 'http://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/', label: 'erogamescape.dyndns.org' },
                  { value: 'https://erogamescape.org/~ap2/ero/toukei_kaiseki/', label: 'erogamescape.org' },
                  { value: 'https://ero.plumz.me', label: 'ero.plumz.me（镜像站）' },
                ]}
              />
              <Tooltip title='检测连通性'>
                <Button
                  variant='text'
                  color={btnColor}
                  icon={icon}
                  onClick={testConnectivity}
                  loading={checking}
                />
              </Tooltip>
            </div>
          </SettingItem>
          <SettingItem
            label='请求超时'
            description='判定连接超时的时长'
            help='通常批评空间请求超过30s就会报502'
          >
            <InputNumber
              className='w-60!'
              min={1}
              max={120}
              precision={0}
              value={erogamescapeTimeout}
              onChange={(v) => v !== null && setErogamescapeTimeout(v)}
              suffix='s'
            />
          </SettingItem>
          {erogamescapeUrl === 'https://ero.plumz.me' && (
            <SettingItem label='镜像站登录凭证' description='见视研会QQ群公告'>
              <Space>
                <Typography.Text type='secondary'>{erogamescapeUsername && erogamescapePassword ? '已设置' : '未设置'}</Typography.Text>
                <Button
                  onClick={() => {
                    setUsernameDraft(erogamescapeUsername);
                    setPasswordDraft(erogamescapePassword);
                    setAuthDialogOpen(true);
                  }}
                >
                  {erogamescapeUsername && erogamescapePassword ? '修改' : '设置'}
                </Button>
              </Space>
            </SettingItem>
          )}
        </div>
      </Card>

      <Modal
        title='批评空间镜像站登录凭证'
        open={authDialogOpen}
        onOk={() => {
          setErogamescapeUsername(usernameDraft);
          setErogamescapePassword(passwordDraft);
          setAuthDialogOpen(false);
        }}
        onCancel={() => setAuthDialogOpen(false)}
        okText='保存'
        cancelText='取消'
      >
        <div className='flex flex-col gap-4'>
          <div>
            <div className='mb-1'>账号</div>
            <Input
              placeholder='请输入账号'
              value={usernameDraft}
              onChange={(e) => setUsernameDraft(e.target.value)}
            />
          </div>
          <div>
            <div className='mb-1'>密码</div>
            <Input
              placeholder='请输入密码'
              value={passwordDraft}
              onChange={(e) => setPasswordDraft(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
