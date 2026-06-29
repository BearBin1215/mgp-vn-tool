import { useMemo, useRef, useState } from 'react';
import { App, Button, Descriptions, Empty, Input, Result, Splitter, Tooltip, Typography } from 'antd';
import { CheckOutlined, LinkOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router';
import Page from '@/components/page';
import CopyButton from '@/components/CopyButton';
import SearchInput, { type SearchInputHandle, type SearchInputOption } from '@/components/SearchInput';
import { queryVndbProducer, searchVndbProducers, type VndbProducerData } from '@/api/vndb';
import { queryBangumiCompany, type BangumiCompanyData } from '@/api/bangumi';
import { useArticleStore } from '@/stores/articleStore';
import { buildGameArticleMap } from '@/utils/articleMap';
import { resolveInputId } from '@/utils/text';
import { generateCompanyWikitext, ensureSameCompany, type CompanyData } from './generateWikitext';

/** queryCompanyData 的返回：聚合数据 + 可选 Bangumi 数据源的失败原因（降级时非 null） */
interface CompanyDataResult {
  data: CompanyData;
  /** Bangumi 请求失败原因；Bangumi 未填或成功时为 null */
  bangumiError: unknown | null;
}

/**
 * 根据 VNDB producer id（可选 Bangumi person id）抓取会社原始数据。
 *
 * 并发调用 VNDB 与 Bangumi 两个独立接口，组装为聚合的 CompanyData。
 * VNDB 始终查询；Bangumi 仅在提供 person id 时查询，为可选数据源——
 * 其请求失败时降级为 null（仅以 VNDB 数据生成），不阻断主流程，失败原因随结果返回供调用方提示。
 */
async function queryCompanyData(
  producerId: number,
  bgmPersonId: number | null,
): Promise<CompanyDataResult> {
  const vndbPromise: Promise<VndbProducerData> = queryVndbProducer(producerId);
  // Bangumi 为可选数据源：失败时降级为 null（仅 VNDB 生成），不阻断主流程；
  // 失败原因（后端已格式化为含 title/description 的可读串）经闭包变量带出供调用方提示
  let bangumiError: unknown | null = null;
  const bangumiPromise: Promise<BangumiCompanyData | null> = bgmPersonId
    ? queryBangumiCompany(bgmPersonId).catch((e: unknown) => {
      bangumiError = e;
      return null;
    })
    : Promise.resolve(null);
  const [vndb, bangumi] = await Promise.all([vndbPromise, bangumiPromise]);
  return {
    data: {
      vndb: vndb.producer,
      galgames: vndb.galgames,
      bangumi: bangumi?.company ?? null,
      anime: bangumi?.anime ?? [],
      music: bangumi?.music ?? [],
      book: bangumi?.book ?? [],
    },
    bangumiError,
  };
}

/** 将任意值格式化为可读的错误信息字符串 */
const formatError = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** 从用户输入的数字或链接中解析 Bangumi person id */
function parseBangumiId(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  const match = trimmed.match(/bgm\.tv\/person\/(\d+)/i);
  return match ? Number(match[1]) : null;
}

/** VNDB producer 类型标签 */
const PRODUCER_TYPE_LABELS: Record<string, string> = {
  co: '会社',
  in: '个人',
  ng: '同人团体',
};

/** 生成 VNDB 搜索下拉项的展示文本：名称（原文、别名…）【类型】 */
const producerOptionLabel = (item: {
  name: string;
  original: string | null;
  aliases: string[];
  type: string | null;
}): string => {
  const parts: string[] = [item.name];
  // 括号内收集 original 与所有别名，去空、去重、去掉与 name 重复项，用顿号连接
  const extras: string[] = [];
  const seen = new Set([item.name]);
  const push = (v: string | null | undefined) => {
    if (v && v.trim() && !seen.has(v)) {
      seen.add(v);
      extras.push(v);
    }
  };
  push(item.original);
  item.aliases.forEach(push);
  if (extras.length > 0) {
    parts.push(`（${extras.join('、')}）`);
  }
  if (item.type && PRODUCER_TYPE_LABELS[item.type]) {
    parts.push(`【${PRODUCER_TYPE_LABELS[item.type]}】`);
  }
  return parts.join('');
};

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
  const searchInputRef = useRef<SearchInputHandle>(null);
  const [searchValue, setSearchValue] = useState('');
  const [selectedProducerId, setSelectedProducerId] = useState<string | null>(null);
  const [bangumiInput, setBangumiInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CompanyData | null>(null);
  const [wikitext, setWikitext] = useState('');
  // 用户在「未获取条目数据」提示页点击「继续使用」后标记，本会话内不再提示（页面级，不跨页面共享）
  const [dismissedEmptyWarning, setDismissedEmptyWarning] = useState(false);

  const producerId = resolveInputId(selectedProducerId, searchValue);
  const bgmPersonId = useMemo(() => parseBangumiId(bangumiInput), [bangumiInput]);
  const bangumiInvalid = bangumiInput.trim() !== '' && !bgmPersonId;

  /** 名称搜索：调用 VNDB 接口并映射为下拉选项 */
  const handleFetchProducerOptions = async (keyword: string): Promise<SearchInputOption[]> => {
    const results = await searchVndbProducers(keyword);
    return results.map((item) => ({
      value: item.name,
      label: producerOptionLabel(item),
      id: item.id,
    }));
  };

  /** VNDB 输入变化（手动输入/选中/清空）时清除上一轮生成结果 */
  const handleProducerValueChange = (value: string) => {
    setSearchValue(value);
    setData(null);
    setWikitext('');
  };

  /** VNDB 选中项 id 变化时清除上一轮生成结果 */
  const handleProducerIdChange = (id: string | null) => {
    setSelectedProducerId(id);
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
      message.warning('请通过名称搜索选择会社，或直接输入 VNDB producer id');
      return;
    }
    if (bangumiInvalid) {
      message.warning('Bangumi 输入无法识别，请输入 person id 或条目链接');
      return;
    }

    // 取消可能挂起的搜索，避免生成期间输入框残留搜索中提示
    searchInputRef.current?.cancelPendingSearch();
    setLoading(true);
    setData(null);
    setWikitext('');
    try {
      const { data: companyData, bangumiError } = await queryCompanyData(parseInt(producerId, 10), bgmPersonId);

      // Bangumi 为可选数据源：用户填了 id 但请求失败降级为空时，非阻断提示（含失败原因）
      if (bgmPersonId && bangumiError) {
        message.warning(`Bangumi 数据获取失败，已仅以 VNDB 数据生成：${formatError(bangumiError)}`);
      }

      // 前端一致性校验：不一致时弹确认框，用户可选择继续或中止
      if (companyData.bangumi) {
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
      message.error(`生成失败: ${formatError(e)}`);
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
        <div className='grid grid-cols-1 lg:grid-cols-[1fr_1fr_auto] gap-2'>
          <SearchInput
            ref={searchInputRef}
            className='w-full'
            fetchOptions={handleFetchProducerOptions}
            onValueChange={handleProducerValueChange}
            onIdChange={handleProducerIdChange}
            disabled={loading}
            placeholder='通过名称搜索 VNDB 会社，或直接输入 producer id'
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
          <span>已识别：VNDB {producerId || '-'}，Bangumi {bgmPersonId || '-'}</span>
          <span>{countLabel(data)}</span>
        </div>
      </div>

      {data ? (
        <Splitter className='flex-1 min-h-0 px-4 pb-4'>
          <Splitter.Panel
            defaultSize='60%'
            min='30%'
            className='flex flex-col min-w-0'
          >
            <div className='flex items-center justify-between shrink-0 px-1 h-6'>
              <Typography.Text strong>生成结果</Typography.Text>
              <CopyButton text={wikitext} />
            </div>
            <pre className='bg-(--ant-color-bg-elevated) border border-(--ant-color-border) p-2 text-sm overflow-auto whitespace-pre-wrap m-0 leading-relaxed flex-1 min-h-0'>
              {wikitext}
            </pre>
          </Splitter.Panel>

          <Splitter.Panel
            defaultSize='40%'
            min='20%'
            max='70%'
            collapsible={{ start: true, showCollapsibleIcon: true }}
            className='flex flex-col min-w-0'
          >
            <div className='h-full overflow-auto border border-(--ant-color-border) p-3 bg-(--ant-color-bg-container)'>
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
                  {data.vndb.official_website || '-'}
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
        <div className='flex-1 min-h-0 grid place-items-center border border-dashed border-(--ant-color-border) bg-(--ant-color-bg-container)'>
          <Empty
            description='输入 VNDB 公司条目后开始生成会社条目 wikitext'
          />
        </div>
      )}
    </Page>
  );
}
