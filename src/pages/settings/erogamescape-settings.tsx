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
import { useTranslation } from 'react-i18next';
import { EROGAMESCAPE_URLS, type ErogamescapeUrl } from '@/lib/types';
import { useSettingsStore } from '@/stores/settings-store';
import { formatError, type ToolErrorShape } from '@/utils/error';
import SettingItem from './setting-item';

/** 各批评空间地址的显示标签，键与 ErogamescapeUrl 联合类型对齐，新增地址时编译器会提示补全；值为 i18n key，未收录时回退简体原文 */
const URL_LABELS: Record<ErogamescapeUrl, string> = {
  'http://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki': 'erogamescape.dyndns.org',
  'https://erogamescape.org/~ap2/ero/toukei_kaiseki': 'erogamescape.org',
  'https://ero.plumz.me': 'ero.plumz.me（镜像站）',
};

/** Select 的地址选项，从地址白名单生成保证无尾斜杠 */
const urlOptions = EROGAMESCAPE_URLS.map((url) => ({ value: url, label: URL_LABELS[url] }));

/** 批评空间设置 */
export default function ErogamescapeSettings() {
  const { message } = App.useApp();
  const { t } = useTranslation();
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

  /** 地址选项，标签随界面语言翻译 */
  const translatedUrlOptions = urlOptions.map((option) => ({ ...option, label: t(option.label) }));

  /** 检测批评空间连通性 */
  const testConnectivity = async () => {
    // 镜像站需要携带用户名密码
    if (erogamescapeUrl === 'https://ero.plumz.me' && (!erogamescapeUsername || !erogamescapePassword)) {
      message.warning(t('请先设置镜像站登录凭证'));
      setAuthDialogOpen(true);
      return;
    }
    setChecking(true);
    try {
      const res = await invoke<{ statusCode: string; result: string; response: string | ToolErrorShape }>('check_connectivity');
      setCheckResults((prev) => ({ ...prev, [erogamescapeUrl]: res.result === 'success' ? 'success' : 'fail' }));
      if (res.result === 'success') {
        message.success(t('连通正常'));
      } else {
        message.error(res.statusCode === '0' ? t('连接失败：{{detail}}', { detail: formatError(res.response) }) : t('无法访问（{{status}}）', { status: res.statusCode }));
      }
    } catch {
      setCheckResults((prev) => ({ ...prev, [erogamescapeUrl]: 'fail' }));
      message.error(t('连接失败'));
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
      <Card title={t('批评空间')}>
        <div className='flex flex-col gap-4'>
          <SettingItem
            label={t('访问地址')}
            description={t('从批评空间（erogamescape）读取数据时的访问地址')}
            help={<>{t('原站')}<b>{t('通常')}</b>{t('需要日本IP或家宽；镜像站仅限国内访问，且暂不支持sql查询（影响目前绝大多数功能）')}</>}
          >
            <div className='flex gap-1 w-60'>
              <Select
                className='grow'
                value={erogamescapeUrl}
                onChange={setErogamescapeHost}
                options={translatedUrlOptions}
              />
              <Tooltip title={t('检测连通性')}>
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
            label={t('请求超时')}
            description={t('判定连接超时的时长')}
            help={t('通常批评空间请求超过30s就会报502')}
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
            <SettingItem label={t('镜像站登录凭证')} description={t('见视研会QQ群公告')}>
              <Space>
                <Typography.Text type='secondary'>{erogamescapeUsername && erogamescapePassword ? t('已设置') : t('未设置')}</Typography.Text>
                <Button
                  onClick={() => {
                    setUsernameDraft(erogamescapeUsername);
                    setPasswordDraft(erogamescapePassword);
                    setAuthDialogOpen(true);
                  }}
                >
                  {erogamescapeUsername && erogamescapePassword ? t('修改') : t('设置')}
                </Button>
              </Space>
            </SettingItem>
          )}
        </div>
      </Card>

      <Modal
        title={t('批评空间镜像站登录凭证')}
        open={authDialogOpen}
        onOk={() => {
          setErogamescapeUsername(usernameDraft);
          setErogamescapePassword(passwordDraft);
          setAuthDialogOpen(false);
        }}
        onCancel={() => setAuthDialogOpen(false)}
        okText={t('保存')}
        cancelText={t('取消')}
      >
        <div className='flex flex-col gap-4'>
          <div>
            <div className='mb-1'>{t('账号')}</div>
            <Input
              placeholder={t('请输入账号')}
              value={usernameDraft}
              onChange={(e) => setUsernameDraft(e.target.value)}
            />
          </div>
          <div>
            <div className='mb-1'>{t('密码')}</div>
            <Input
              placeholder={t('请输入密码')}
              value={passwordDraft}
              onChange={(e) => setPasswordDraft(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
