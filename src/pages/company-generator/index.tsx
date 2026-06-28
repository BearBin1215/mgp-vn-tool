import { useMemo, useState } from 'react';
import { Alert, App, Button, Checkbox, Descriptions, Empty, Input, Splitter, Tooltip, Typography } from 'antd';
import { CheckOutlined, LinkOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import Page from '@/components/page';
import CopyButton from '@/components/CopyButton';
import { generateCompanyWikitext, type GeneratedCompanyArticle } from '@/api/company';

/** 从用户输入的数字或链接中解析 VNDB/Bangumi ID */
function parseId(value: string, kind: 'vndb' | 'bangumi') {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  const pattern = kind === 'vndb'
    ? /vndb\.org\/p(\d+)/i
    : /bgm\.tv\/person\/(\d+)/i;
  const match = trimmed.match(pattern);
  return match ? Number(match[1]) : null;
}

/** 生成人类可读的作品数量摘要 */
function countLabel(result: GeneratedCompanyArticle | null) {
  if (!result) {
    return '尚未生成';
  }
  const counts = result.counts || {};
  return `Galgame ${counts.galgame || 0} / 动画 ${counts.anime || 0} / 音乐 ${counts.music || 0} / 书籍 ${counts.book || 0}`;
}

/** Galgame 会社条目生成页面 */
export default function CompanyGenerator() {
  const { message } = App.useApp();
  const [producerInput, setProducerInput] = useState('');
  const [bangumiInput, setBangumiInput] = useState('');
  const [force, setForce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeneratedCompanyArticle | null>(null);

  const producerId = useMemo(() => parseId(producerInput, 'vndb'), [producerInput]);
  const bgmPersonId = useMemo(() => parseId(bangumiInput, 'bangumi'), [bangumiInput]);
  const bangumiInvalid = bangumiInput.trim() !== '' && !bgmPersonId;

  /** 更新 VNDB 输入，同时清除上一轮生成结果，避免显示与当前输入不符的旧 wikitext */
  const handleProducerChange = (value: string) => {
    setProducerInput(value);
    setResult(null);
  };

  /** 更新 Bangumi 输入，同时清除上一轮生成结果 */
  const handleBangumiChange = (value: string) => {
    setBangumiInput(value);
    setResult(null);
  };

  /** 根据当前输入调用后端生成条目 wikitext */
  const handleGenerate = async () => {
    if (!producerId) {
      message.warning('请输入 VNDB producer id，或形如 https://vndb.org/p24 的链接');
      return;
    }
    if (bangumiInvalid) {
      message.warning('Bangumi 输入无法识别，请输入 person id 或条目链接');
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const data = await generateCompanyWikitext(producerId, bgmPersonId, force);
      setResult(data);
      message.success('生成完成');
    } catch (e) {
      message.error(`生成失败: ${e instanceof Error ? e.message : e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page
      className='flex flex-col'
      actions={
        <Tooltip title='VNDB 必填；Bangumi 可选，用于补充 Logo、别名、官网和衍生作品。'>
          <Button type='text' icon={<QuestionCircleOutlined />} />
        </Tooltip>
      }
    >
      <div className='flex flex-col gap-3 mb-3 shrink-0'>
        <Alert
          type='warning'
          showIcon
          title='bangumi网络波动较多，若报502请尝试留空bgm id'
        />
        <div className='grid grid-cols-1 lg:grid-cols-[1fr_1fr_auto] gap-2'>
          <Input
            value={producerInput}
            onChange={(e) => handleProducerChange(e.target.value)}
            disabled={loading}
            placeholder='VNDB producer id 或链接，例如 24 / https://vndb.org/p24'
            prefix={<LinkOutlined />}
            status={producerInput.trim() && !producerId ? 'error' : undefined}
          />
          <Input
            value={bangumiInput}
            onChange={(e) => handleBangumiChange(e.target.value)}
            disabled={loading}
            placeholder='Bangumi person id 或链接，可留空，例如 47 / https://bgm.tv/person/47'
            prefix={<LinkOutlined />}
            status={bangumiInvalid ? 'error' : undefined}
          />
          <Button
            type='primary'
            icon={<CheckOutlined />}
            loading={loading}
            disabled={!producerId || bangumiInvalid}
            onClick={handleGenerate}
          >
            开始生成
          </Button>
        </div>
        <div className='flex flex-wrap items-center gap-4 text-xs text-(--ant-color-text-secondary)'>
          <Checkbox
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            disabled={loading}
          >
            忽略 VNDB / Bangumi 公司匹配警告
          </Checkbox>
          <span>已识别：VNDB {producerId || '-'}，Bangumi {bgmPersonId || '-'}</span>
          <span>{countLabel(result)}</span>
        </div>
      </div>

      {result ? (
        <Splitter className='flex-1 min-h-0 px-1 pb-1'>
          <Splitter.Panel
            defaultSize='62%'
            min='35%'
            className='flex flex-col min-w-0'
          >
            <Alert
              className='mb-2'
              type='info'
              showIcon
              title='工具生成条目为半成品，请勿直接提交萌娘百科'
            />
            <div className='flex items-center justify-between shrink-0 px-1 h-7'>
              <Typography.Text strong>生成结果</Typography.Text>
              <CopyButton text={result.wikitext} />
            </div>
            <pre className='bg-(--ant-color-bg-elevated) border border-(--ant-color-border) rounded-lg p-4 text-sm overflow-auto whitespace-pre-wrap m-0 leading-relaxed flex-1 min-h-0'>
              {result.wikitext}
            </pre>
          </Splitter.Panel>

          <Splitter.Panel
            defaultSize='38%'
            min='24%'
            max='65%'
            collapsible={{ start: true, showCollapsibleIcon: true }}
            className='min-w-0'
          >
            <div className='h-full overflow-auto border border-(--ant-color-border) rounded-lg p-3 bg-(--ant-color-bg-container)'>
              <Typography.Text strong>来源摘要</Typography.Text>
              <Descriptions
                className='mt-3'
                size='small'
                column={1}
                bordered
              >
                <Descriptions.Item label='VNDB'>
                  <a
                    href={result.vndb.url}
                    target='_blank'
                    rel='noreferrer'
                  >
                    {result.vndb.name}
                  </a>
                </Descriptions.Item>
                <Descriptions.Item label='VNDB 别名'>
                  {result.vndb.aliases?.join('、') || '-'}
                </Descriptions.Item>
                <Descriptions.Item label='VNDB 官网'>
                  {result.vndb.official_website?.url || '-'}
                </Descriptions.Item>
                <Descriptions.Item label='Bangumi'>
                  {result.bangumi ? (
                    <a
                      href={result.bangumi.url}
                      target='_blank'
                      rel='noreferrer'
                    >
                      {result.bangumi.name}
                    </a>
                  ) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label='Bangumi 别名'>
                  {result.bangumi?.aliases?.join('、') || '-'}
                </Descriptions.Item>
                <Descriptions.Item label='作品数量'>
                  {countLabel(result)}
                </Descriptions.Item>
              </Descriptions>
            </div>
          </Splitter.Panel>
        </Splitter>
      ) : (
        <div className='flex-1 min-h-0 grid place-items-center border border-dashed border-(--ant-color-border) rounded-lg bg-(--ant-color-bg-container)'>
          <Empty
            description='输入 VNDB 公司条目后开始生成会社条目 wikitext'
          />
        </div>
      )}
    </Page>
  );
}
