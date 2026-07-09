import { useMemo, useRef, useState } from 'react';
import {
  App,
  Button,
  Descriptions,
  Splitter,
  Spin,
  Table,
  Typography,
  type TableColumnsType,
} from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import Page from '@/components/page';
import CodePanel from '@/components/code-panel';
import EmptyPlaceholder from '@/components/empty-placeholder';
import HelpButton from '@/components/help-button';
import EmptyArticleWarning from '@/components/empty-article-warning';
import SearchInput, { type SearchInputHandle, type SearchInputOption } from '@/components/search-input';
import { queryVndbProducer, searchVndbProducers, type VndbProducerData, type VndbWork } from '@/api/vndb';
import {
  queryBangumiCompany,
  searchBangumiPersons,
  type BangumiCompanyData,
  type BangumiPersonSearchResult,
  type BangumiWork,
} from '@/api/bangumi';
import { fetchPageInfo, type PageInfo } from '@/api/moegirl';
import { useArticleStore } from '@/stores/article-store';
import { buildGameArticleMap } from '@/utils/article-map';
import { resolveInputId, formatError } from '@/utils/text';
import { toTableData } from '@/utils/table';
import { generateCompanyWikitext, ensureSameCompany, type CompanyData } from './generate-wikitext';

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

/** 日期或占位：空值显示 '-' */
const dateOrDash = (v: string | null) => v || '-';

type TableVndbWork = VndbWork & { key: string };

/** 游戏作品表格列定义（VNDB Galgame） */
const galgameColumns: TableColumnsType<TableVndbWork> = [
  {
    title: '原名',
    dataIndex: 'original_title',
    key: 'original_title',
  },
  {
    title: '中文名',
    dataIndex: 'chinese_title',
    key: 'chinese_title',
    render: (v: string | null) => v || '-',
  },
  {
    title: '发售日期',
    dataIndex: 'date',
    key: 'date',
    width: 120,
    render: dateOrDash,
  },
  {
    title: 'VN',
    dataIndex: 'id',
    key: 'id',
    width: 80,
    render: (id: string) => (
      <a
        href={`https://vndb.org/${id}`}
        target='_blank'
        rel='noreferrer'
      >
        {id}
      </a>
    ),
  },
];

type TableBangumiWork = BangumiWork & { key: string };

/** 衍生作品表格列定义（Bangumi 动画/音乐/书籍通用） */
const bangumiWorkColumns: TableColumnsType<TableBangumiWork> = [
  {
    title: '原名',
    dataIndex: 'name',
    key: 'name',
  },
  {
    title: '中文名',
    dataIndex: 'name_cn',
    key: 'name_cn',
    render: (v: string | null) => v || '-',
  },
  {
    title: '发售日期',
    dataIndex: 'date',
    key: 'date',
    width: 120,
    render: dateOrDash,
  },
];

/** Galgame 会社条目生成页面 */
export default function CompanyGenerator() {
  const { message, modal } = App.useApp();
  const articles = useArticleStore((s) => s.articles);
  const updatedAt = useArticleStore((s) => s.updatedAt);

  const gameArticleMap = useMemo(() => buildGameArticleMap(articles), [articles]);
  const searchInputRef = useRef<SearchInputHandle>(null);
  const bangumiInputRef = useRef<SearchInputHandle>(null);
  const [searchValue, setSearchValue] = useState('');
  const [selectedProducerId, setSelectedProducerId] = useState<string | null>(null);
  const [bangumiSearchValue, setBangumiSearchValue] = useState('');
  const [selectedBangumiPersonId, setSelectedBangumiPersonId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CompanyData | null>(null);
  const [wikitext, setWikitext] = useState('');
  // 用户在「未获取条目数据」提示页点击「继续使用」后标记，本会话内不再提示（页面级，不跨页面共享）
  const [dismissedEmptyWarning, setDismissedEmptyWarning] = useState(false);

  // 右侧原始数据表格所需的数据（补充 key 字段）
  const tableData = useMemo(() => ({
    galgame: toTableData(data?.galgames ?? []),
    anime: toTableData(data?.anime ?? []),
    music: toTableData(data?.music ?? []),
    book: toTableData(data?.book ?? []),
  }), [data]);

  const producerId = resolveInputId(selectedProducerId, searchValue);
  const bgmPersonId = useMemo(() => {
    if (selectedBangumiPersonId) {
      return Number(selectedBangumiPersonId);
    }
    return parseBangumiId(bangumiSearchValue);
  }, [selectedBangumiPersonId, bangumiSearchValue]);
  const bangumiInvalid = bangumiSearchValue.trim() !== '' && !bgmPersonId;

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

  /** Bangumi 名称搜索：调用 Bangumi 接口并映射为下拉选项 */
  const handleFetchBangumiOptions = async (keyword: string): Promise<SearchInputOption[]> => {
    const results = await searchBangumiPersons(keyword);
    return results.map((item: BangumiPersonSearchResult) => ({
      value: item.name,
      label: item.name,
      id: String(item.id),
    }));
  };

  /** Bangumi 输入变化（手动输入/选中/清空）时清除上一轮生成结果 */
  const handleBangumiValueChange = (value: string) => {
    setBangumiSearchValue(value);
    setData(null);
    setWikitext('');
  };

  /** Bangumi 选中项 id 变化时清除上一轮生成结果 */
  const handleBangumiIdChange = (id: string | null) => {
    setSelectedBangumiPersonId(id);
    setData(null);
    setWikitext('');
  };

  /** 渲染 wikitext 并展示 */
  const render = (companyData: CompanyData, pageInfoMap?: Map<string, PageInfo>) => {
    setData(companyData);
    setWikitext(generateCompanyWikitext(companyData, gameArticleMap, pageInfoMap));
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
    bangumiInputRef.current?.cancelPendingSearch();
    setLoading(true);
    setData(null);
    setWikitext('');
    try {
      const { data: companyData, bangumiError } = await queryCompanyData(parseInt(producerId, 10), bgmPersonId);

      // Bangumi 为可选数据源：用户填了 id 但请求失败降级为空时，非阻断提示（含失败原因）
      if (bgmPersonId && bangumiError) {
        message.warning(`Bangumi 数据获取失败，已仅以 VNDB 数据生成：${formatError(bangumiError)}`, 5);
      }

      // 查询会社大家族模板页面信息（Template:{会社名}）
      let pageInfoMap: Map<string, PageInfo> | undefined;
      if (companyData.vndb.name) {
        try {
          pageInfoMap = await fetchPageInfo([`Template:${companyData.vndb.name}`]);
        } catch {
          message.warning('获取会社大家族模板信息失败，将跳过模板');
        }
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
              render(companyData, pageInfoMap);
              message.success('生成完成');
            },
          });
          return;
        }
      }

      render(companyData, pageInfoMap);
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
          <HelpButton>
            <li>VNDB 为必填项，用于生成会社基础信息与 Galgame 作品列表。</li>
            <li>Bangumi 为可选项，用于补充 Logo、别名、官网和衍生作品（动画、音乐、书籍）。</li>
            <li>Bangumi 网络环境较差，请求失败时会自动跳过，仅以 VNDB 数据生成条目。</li>
            <li>作品内链根据条目统计及重定向页判断添加，遇到续作、特殊符号等无法判断，可能需要手动补充。</li>
            <li>提交前务必认真检查内容，如有错漏本工具不承担责任。</li>
          </HelpButton>
        }
      >
        <EmptyArticleWarning
          subTitle='条目统计数据为空，生成条目时可能无法正常生成作品内链。建议先前往条目统计页面获取数据。'
          onDismiss={() => setDismissedEmptyWarning(true)}
        />
      </Page>
    );
  }

  return (
    <Page
      className='flex flex-col'
      actions={
        <HelpButton>
          <li>VNDB 为必填项，用于生成会社基础信息与 Galgame 作品列表。</li>
          <li>Bangumi 为可选项，用于补充 Logo、别名、官网和衍生作品（动画、音乐、书籍）。</li>
          <li>Bangumi 网络环境较差，请求失败时会自动跳过，仅以 VNDB 数据生成条目。</li>
          <li>作品内链根据条目统计及重定向页判断添加，遇到续作、特殊符号等无法判断，可能需要手动补充。</li>
          <li>提交前务必认真检查内容，如有错漏本工具不承担责任。</li>
        </HelpButton>
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
          <SearchInput
            ref={bangumiInputRef}
            className='w-full'
            fetchOptions={handleFetchBangumiOptions}
            onValueChange={handleBangumiValueChange}
            onIdChange={handleBangumiIdChange}
            disabled={loading}
            placeholder='通过名称搜索 Bangumi 会社，或直接输入 person id / 链接'
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

      {loading && (
        <div className='flex-1 flex items-center justify-center'>
          <Spin description='正在生成会社条目...' />
        </div>
      )}
      {!loading && data && (
        <Splitter className='flex-1 min-h-0 px-4 pb-4'>
          <Splitter.Panel
            defaultSize='60%'
            min='30%'
            className='flex flex-col min-w-0'
          >
            <CodePanel variant='inset' text={wikitext} />
          </Splitter.Panel>

          <Splitter.Panel
            defaultSize='40%'
            min='20%'
            max='70%'
            collapsible={{ start: true, showCollapsibleIcon: true }}
            className='flex flex-col min-w-0'
          >
            <div className='flex items-center justify-between shrink-0 px-1 h-6'>
              <Typography.Text strong>VNDB/Bangumi原始数据</Typography.Text>
            </div>
            <div className='overflow-auto flex-1 min-h-0 border border-(--ant-color-border)'>
              <Descriptions
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

              {tableData.galgame.length > 0 && (
                <>
                  <Typography.Text strong>游戏作品</Typography.Text>
                  <Table
                    columns={galgameColumns}
                    dataSource={tableData.galgame}
                    size='small'
                    pagination={false}
                  />
                </>
              )}
              {tableData.anime.length > 0 && (
                <>
                  <Typography.Text strong>衍生动画</Typography.Text>
                  <Table
                    columns={bangumiWorkColumns}
                    dataSource={tableData.anime}
                    size='small'
                    pagination={false}
                  />
                </>
              )}
              {tableData.music.length > 0 && (
                <>
                  <Typography.Text strong>衍生音乐</Typography.Text>
                  <Table
                    columns={bangumiWorkColumns}
                    dataSource={tableData.music}
                    size='small'
                    pagination={false}
                  />
                </>
              )}
              {tableData.book.length > 0 && (
                <>
                  <Typography.Text strong>衍生书籍</Typography.Text>
                  <Table
                    columns={bangumiWorkColumns}
                    dataSource={tableData.book}
                    size='small'
                    pagination={false}
                  />
                </>
              )}
            </div>
          </Splitter.Panel>
        </Splitter>
      )}
      {!loading && !data && (
        <EmptyPlaceholder description='输入 VNDB 公司条目后开始生成会社条目 wikitext' />
      )}
    </Page>
  );
}
