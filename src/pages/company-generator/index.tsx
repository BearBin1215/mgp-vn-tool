import { useMemo, useState } from 'react';
import { Alert, App, Button, Checkbox, Descriptions, Empty, Input, Result, Splitter, Tooltip, Typography } from 'antd';
import { CheckOutlined, LinkOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router';
import Page from '@/components/page';
import CopyButton from '@/components/CopyButton';
import { queryCompanyData, type CompanyData } from '@/api/company';
import { useArticleStore } from '@/stores/articleStore';
import { buildGameArticleMap } from '@/utils/articleMap';
import { generateCompanyWikitext, ensureSameCompany } from './generateWikitext';

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
function countLabel(data: CompanyData | null) {
  if (!data) {
    return '尚未生成';
  }
  return `Galgame ${data.galgames.length} / 动画 ${data.anime.length} / 音乐 ${data.music.length} / 书籍 ${data.book.length}`;
}

/** Galgame 会社条目生成页面 */
export default function CompanyGenerator() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const articles = useArticleStore((s) => s.articles);
  const updatedAt = useArticleStore((s) => s.updatedAt);

  const gameArticleMap = useMemo(() => buildGameArticleMap(articles), [articles]);
  const [producerInput, setProducerInput] = useState('');
  const [bangumiInput, setBangumiInput] = useState('');
  const [force, setForce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CompanyData | null>(null);
  const [wikitext, setWikitext] = useState('');
  // 用户在「未获取条目数据」提示页点击「继续使用」后标记，本会话内不再提示（页面级，不跨页面共享）
  const [dismissedEmptyWarning, setDismissedEmptyWarning] = useState(false);

  const producerId = useMemo(() => parseId(producerInput, 'vndb'), [producerInput]);
  const bgmPersonId = useMemo(() => parseId(bangumiInput, 'bangumi'), [bangumiInput]);
  const bangumiInvalid = bangumiInput.trim() !== '' && !bgmPersonId;

  /** 更新 VNDB 输入，同时清除上一轮生成结果，避免显示与当前输入不符的旧 wikitext */
  const handleProducerChange = (value: string) => {
    setProducerInput(value);
    setData(null);
    setWikitext('');
  };

  /** 更新 Bangumi 输入，同时清除上一轮生成结果 */
  const handleBangumiChange = (value: string) => {
    setBangumiInput(value);
    setData(null);
    setWikitext('');
  };

  /** 渲染 wikitext 并展示 */
  const render = (companyData: CompanyData) => {
    setData(companyData);
    setWikitext(generateCompanyWikitext(companyData, gameArticleMap));
  };

  /** 根据当前输入抓取数据并生成条目 wikitext */
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
    setData(null);
    setWikitext('');
    try {
      const companyData = await queryCompanyData(producerId, bgmPersonId);

      // 前端一致性校验：不一致时弹确认框，用户可选择继续或中止
      if (companyData.bangumi && !force) {
        const check = ensureSameCompany(companyData.vndb, companyData.bangumi);
        if (!check.ok) {
          modal.confirm({
            title: '会社匹配警告',
            content: check.message,
            okText: '仍要继续',
            cancelText: '取消',
            onOk: () => {
              render(companyData);
              message.success('生成完成');
            },
          });
          return;
        }
      }

      render(companyData);
      message.success('生成完成');
    } catch (e) {
      message.error(`生成失败: ${e instanceof Error ? e.message : e}`);
    } finally {
      setLoading(false);
    }
  };

  if (!updatedAt && !dismissedEmptyWarning) {
    return (
      <Page
        actions={
          <Tooltip title='VNDB 必填；Bangumi 可选，用于补充 Logo、别名、官网和衍生作品。'>
            <Button type='text' icon={<QuestionCircleOutlined />} />
          </Tooltip>
        }
      >
        <Result
          status='warning'
          title='未获取条目数据'
          subTitle='条目统计数据为空，生成条目时可能无法正常生成作品内链。建议先前往条目统计页面获取数据。'
          extra={[
            <Button
              key='continue'
              type='primary'
              onClick={() => setDismissedEmptyWarning(true)}
            >
              继续使用
            </Button>,
            <Button key='fetch' onClick={() => navigate('/article-stats')}>
              前往获取数据
            </Button>,
          ]}
        />
      </Page>
    );
  }

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
          <span>{countLabel(data)}</span>
        </div>
      </div>

      {data ? (
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
              <CopyButton text={wikitext} />
            </div>
            <pre className='bg-(--ant-color-bg-elevated) border border-(--ant-color-border) rounded-lg p-4 text-sm overflow-auto whitespace-pre-wrap m-0 leading-relaxed flex-1 min-h-0'>
              {wikitext}
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
                    href={`https://vndb.org/p${data.vndb.id}/vn`}
                    target='_blank'
                    rel='noreferrer'
                  >
                    {data.vndb.name}
                  </a>
                </Descriptions.Item>
                <Descriptions.Item label='VNDB 别名'>
                  {data.vndb.aliases?.join('、') || '-'}
                </Descriptions.Item>
                <Descriptions.Item label='VNDB 官网'>
                  {data.vndb.official_website?.url || '-'}
                </Descriptions.Item>
                <Descriptions.Item label='Bangumi'>
                  {data.bangumi ? (
                    <a
                      href={`https://bgm.tv/person/${data.bangumi.id}`}
                      target='_blank'
                      rel='noreferrer'
                    >
                      {data.bangumi.name}
                    </a>
                  ) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label='Bangumi 别名'>
                  {data.bangumi?.aliases?.join('、') || '-'}
                </Descriptions.Item>
                <Descriptions.Item label='作品数量'>
                  {countLabel(data)}
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
