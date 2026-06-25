import { useEffect, useState } from 'react';
import { Card, Typography, Space, Button, App, Tooltip } from 'antd';
import { GithubOutlined, UserOutlined, InfoCircleOutlined, ToolOutlined, FolderOpenOutlined, EditOutlined, CommentOutlined, SyncOutlined } from '@ant-design/icons';
import { openUrl, openPath } from '@tauri-apps/plugin-opener';
import { appConfigDir, appLocalDataDir } from '@tauri-apps/api/path';
import { version } from '../../../package.json';
import Page from '@/components/page';
import MoegirlLink from '@/components/MoegirlLink';
import ExternalLink from '@/components/ExternalLink';
import AboutItem from './AboutItem';
import avatar from '@/assets/BearBin.jpg';

export default function About() {
  const { message, modal } = App.useApp();
  const [configDir, setConfigDir] = useState('');
  const [logDir, setLogDir] = useState('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    appConfigDir().then(setConfigDir);
    appLocalDataDir().then((dir) => setLogDir(dir));
  }, []);

  /** 检查版本更新 */
  const checkUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const resp = await fetch('https://api.github.com/repos/BearBin1215/mgp-vn-tool/releases/latest');
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        const msg = (body as { message?: string })?.message || resp.statusText;
        throw new Error(`${resp.status}: ${msg}`);
      }
      const data = await resp.json();
      const latestVersion = (data.tag_name as string).replace(/^v/, '');
      if (latestVersion === version) {
        message.info('当前已是最新版本');
        return;
      }
      modal.confirm({
        title: '发现新版本',
        content: `最新版本为 v${latestVersion}，当前版本为 v${version}`,
        okText: '查看',
        cancelText: '取消',
        onOk: () => openUrl(data.html_url),
      });
    } catch (e) {
      message.error(`检查更新失败: ${e instanceof Error ? e.message : e}`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <Page>
      <div className='flex flex-col gap-3'>
        <Card>
          <Typography.Title level={5} className='mb-4!'>
            萌百视研会条目工具
          </Typography.Title>
          <Typography.Text type='secondary'>
            供萌百视觉小说研究会成员使用的工具集，用于生成条目代码、获取条目统计数据等。
          </Typography.Text>
          <br />
          <Typography.Text type='secondary'>
            更多功能规划中，敬请期待~
          </Typography.Text>
        </Card>

        <Card>
          <div className='flex flex-col gap-4'>
            <AboutItem icon={<GithubOutlined />} label='GitHub 仓库'>
              <ExternalLink href='https://github.com/BearBin1215/mgp-vn-tool'>
                BearBin1215/mgp-vn-tool
              </ExternalLink>
            </AboutItem>
            <AboutItem icon={<UserOutlined />} label='作者'>
              <MoegirlLink title='User:BearBin'>
                <div className='flex items-center gap-1'>
                  <img
                    src={avatar}
                    alt='BearBin'
                    className='w-6 h-6 rounded-full object-cover'
                  />
                  BearBin
                </div>
              </MoegirlLink>
            </AboutItem>
            <AboutItem icon={<InfoCircleOutlined />} label='版本'>
              <div className='flex items-center gap-1'>
                <span>{`v${version}`}</span>
                <Tooltip title='检查更新'>
                  <Button
                    size='small'
                    type='link'
                    icon={<SyncOutlined />}
                    loading={checkingUpdate}
                    onClick={checkUpdate}
                  />
                </Tooltip>
              </div>
            </AboutItem>
            <AboutItem icon={<ToolOutlined />} label='技术栈'>
              <Space separator='+' size={5}>
                <ExternalLink href='https://tauri.app'>Tauri v2</ExternalLink>
                <ExternalLink href='https://react.dev'>React 19</ExternalLink>
                <ExternalLink href='https://www.typescriptlang.org'>TypeScript</ExternalLink>
              </Space>
            </AboutItem>
          </div>
        </Card>

        <Card>
          <div className='flex flex-col gap-4'>
            <AboutItem icon={<EditOutlined />} label='参与完善'>
              <Space separator={<span className='text-(--ant-color-text-tertiary)'>•</span>}>
                <ExternalLink href='https://github.com/BearBin1215/mgp-vn-tool/pulls'>Pull request</ExternalLink>
                <ExternalLink href='https://github.com/BearBin1215/mgp-vn-tool/blob/main/CONTRIBUTING.md'>贡献指南</ExternalLink>
              </Space>
            </AboutItem>
            <AboutItem icon={<CommentOutlined />} label='提出建议'>
              <Space separator={<span className='text-(--ant-color-text-tertiary)'>•</span>}>
                <ExternalLink href='https://github.com/BearBin1215/mgp-vn-tool/issues'>GitHub Issues</ExternalLink>
                <MoegirlLink title='User_talk:BearBin'>站内讨论页</MoegirlLink>
                <ExternalLink href='https://qm.qq.com/q/SfoxZeUIoY'>视研会QQ群</ExternalLink>
              </Space>
            </AboutItem>
            <AboutItem icon={<FolderOpenOutlined />} label='本地存储目录'>
              <Space separator={<span className='text-(--ant-color-text-tertiary)'>•</span>}>
                <Button
                  size='small'
                  type='link'
                  icon={<FolderOpenOutlined />}
                  onClick={() => configDir && void openPath(configDir)}
                >
                  缓存
                </Button>
                <Button
                  size='small'
                  type='link'
                  icon={<FolderOpenOutlined />}
                  onClick={() => logDir && void openPath(logDir)}
                >
                  日志
                </Button>
              </Space>
            </AboutItem>
          </div>
        </Card>
      </div>
    </Page>
  );
}
