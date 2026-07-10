import { useState, useRef, useMemo } from 'react';
import { Button, App, Splitter, type TableColumnsType } from 'antd';
import { CheckOutlined, ImportOutlined } from '@ant-design/icons';
import { useArticleStore } from '@/stores/article-store';
import Page from '@/components/page';
import CodePanel from '@/components/code-panel';
import EmptyPlaceholder from '@/components/empty-placeholder';
import HelpButton from '@/components/help-button';
import EmptyArticleWarning from '@/components/empty-article-warning';
import DataTablePanel from '@/components/data-table-panel';
import SearchInput, { type SearchInputHandle, type SearchInputOption } from '@/components/search-input';
import { fetchPageInfo, type PageInfo } from '@/api/moegirl';
import {
  queryCreatorWorks,
  searchCreators,
  type CreatorWorksResult,
  type GameRecord,
  type GameConnection,
  type GameConnectionKind,
} from '@/api/erogamescape';
import { shokushuDetailLabels, gameConnectionKindLabels } from '@/lib/erogamescape-dict';
import { resolveInputId } from '@/utils/text';
import { buildGameArticleMap } from '@/utils/article-map';
import { toTableData } from '@/utils/table';
import { generateCVWikitext } from './generate-wikitext';
import TemplateLinkModal from './template-link-modal';

type TableGameRecord = GameRecord & { key: string };
type TableGameConnection = GameConnection & { key: string };

const gameColumns: TableColumnsType<TableGameRecord> = [
  {
    title: '类型',
    dataIndex: 'shubetuDetail',
    key: 'shubetuDetail',
    width: 80,
    render: (value: string) => shokushuDetailLabels[value] || value,
  },
  { title: '角色', dataIndex: 'shubetuDetailName', key: 'shubetuDetailName', width: 120 },
  { title: '游戏名', dataIndex: 'gameName', key: 'gameName', width: 240 },
  { title: '平台', dataIndex: 'model', key: 'model', width: 40 },
  { title: '发售日期', dataIndex: 'sellDay', key: 'sellDay', width: 120 },
];

const musicColumns: TableColumnsType<TableGameRecord> = [
  { title: '歌曲', dataIndex: 'shubetuDetailName', key: 'shubetuDetailName' },
  { title: '游戏名', dataIndex: 'gameName', key: 'gameName' },
  { title: '发售日期', dataIndex: 'sellDay', key: 'sellDay', width: 120 },
];

const connectionColumns: TableColumnsType<TableGameConnection> = [
  {
    title: '类型',
    dataIndex: 'kind',
    key: 'kind',
    width: 80,
    render: (value: GameConnectionKind) => gameConnectionKindLabels[value],
  },
  { title: '衍生作品', dataIndex: 'subjectGameName', key: 'subjectGameName' },
  { title: '原作', dataIndex: 'objectGameName', key: 'objectGameName' },
];

export default function CvGenerator() {
  const { message } = App.useApp();

  const articles = useArticleStore((s) => s.articles);
  const updatedAt = useArticleStore((s) => s.updatedAt);

  const gameArticleMap = useMemo(() => buildGameArticleMap(articles), [articles]);
  const [searchValue, setSearchValue] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const searchInputRef = useRef<SearchInputHandle>(null);
  const [dismissedEmptyWarning, setDismissedEmptyWarning] = useState(false);

  // 批评空间原始数据
  const [creatorWorks, setCreatorWorks] = useState<CreatorWorksResult | null>(null);
  const { actingTableData, musicTableData, connectionsTableData } = useMemo(() => {
    if (!creatorWorks) {
      return { actingTableData: [], musicTableData: [], connectionsTableData: [] };
    }
    return {
      actingTableData: toTableData(creatorWorks.acting),
      musicTableData: toTableData(creatorWorks.music),
      connectionsTableData: toTableData(creatorWorks.gameConnections),
    };
  }, [creatorWorks]);
  const hasSourceData = actingTableData.length > 0 || musicTableData.length > 0;

  // 右侧原始数据表格分段，memoize 以配合 DataTablePanel 的 memo 优化
  const tableSections = useMemo(() => [
    { title: '出演作品', columns: gameColumns, dataSource: actingTableData },
    { title: '音乐作品', columns: musicColumns, dataSource: musicTableData },
    { title: '作品关联', columns: connectionColumns, dataSource: connectionsTableData },
  ], [actingTableData, musicTableData, connectionsTableData]);

  // 生成的代码
  const [wikitext, setWikitext] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  // 显示模板链接弹窗
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  /** 名称搜索：调用批评空间接口并映射为下拉选项 */
  const handleFetchOptions = async (keyword: string): Promise<SearchInputOption[]> => {
    const results = await searchCreators(keyword);
    return results.map((item) => ({
      value: item.id,
      label: `${item.name} - 配音${item.voiceCount}丨音乐${item.musicCount}`,
      id: item.id,
      display: item.name,
    }));
  };

  const canConfirm = resolveInputId(selectedId, searchValue) !== null;

  const handleConfirm = async () => {
    const id = resolveInputId(selectedId, searchValue);
    if (!id) {
      return;
    }

    // 取消可能挂起的搜索，避免生成期间输入框残留搜索中提示
    searchInputRef.current?.cancelPendingSearch();

    // 清空已有数据
    setCreatorWorks(null);
    setWikitext('');
    setRegenerating(false);

    setGenerating(true);
    try {
      const result = await queryCreatorWorks(Number(id));
      setCreatorWorks(result);
      if (result.acting.length === 0 && result.music.length === 0) {
        message.info('未查询到数据');
        return;
      }

      setWikitext(generateCVWikitext(result, gameArticleMap));
      setRegenerating(true);

      const charNames = new Set<string>();
      for (const r of [...result.acting, ...result.music]) {
        const raw = r.shubetuDetailName.replace(/\s+/g, '');
        if (!raw) { continue; }
        for (const name of raw.split('、').filter(Boolean)) {
          charNames.add(name);
        }
      }
      let pageInfoMap: Map<string, PageInfo> | undefined;
      if (charNames.size > 0) {
        try {
          pageInfoMap = await fetchPageInfo([...charNames]);
        } catch {
          message.warning('获取角色页面信息失败，生成的条目文本将不包含内链');
        }
      }

      setWikitext(generateCVWikitext(result, gameArticleMap, pageInfoMap));
      setRegenerating(false);
      message.success('生成完成');
    } catch (e) {
      message.error(`查询失败: ${e instanceof Error ? e.message : e}`);
    } finally {
      setGenerating(false);
      setRegenerating(false);
    }
  };

  if (!updatedAt && !dismissedEmptyWarning) {
    return (
      <Page
        actions={
          <HelpButton>
            <li>作品内链根据条目统计及重定向页判断添加，出现续作、特殊符号等会导致判断不到，需要手动添加。</li>
            <li>角色内链根据名称获取站内页面名称，遇到假名等如果没有重定向就查不到。</li>
            <li>声优信息模板、序言、大家族模板默认填写女性，如果是男性声优要自己改。</li>
            <li>批评空间提供的声优名假名不带空格；"汉字姓＋假名名"的形式已自动拆分，其余情况仍需自行调整</li>
            <li>批评空间会把全角！？一律转换成半角，这里一律改全角，可能也要另外确认。</li>
            <li>提交前务必认真检查内容，如有错漏本工具不承担责任。</li>
          </HelpButton>
        }
      >
        <EmptyArticleWarning
          subTitle='条目统计数据为空，生成条目时可能无法正常生成内链等信息。建议先前往条目统计页面获取数据。'
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
          <li>数据来自批评空间，使用前建议前往设置调整批评空间相关网络设置。</li>
          <li>作品内链根据条目统计及重定向页判断添加，出现续作、特殊符号等会导致判断不到，需要手动添加。</li>
          <li>角色内链根据名称获取站内页面名称，遇到假名等如果没有重定向就查不到。</li>
          <li>声优信息模板、序言、大家族模板默认填写女性，如果是男性声优要自己改。</li>
          <li>批评空间提供的声优名假名不带空格；"汉字姓＋假名名"的形式已自动拆分，其余情况仍需自行调整</li>
          <li>批评空间会把全角！？一律转换成半角，这里一律改全角，可能也要另外确认。</li>
          <li>提交前务必认真检查内容，如有错漏本工具不承担责任。</li>
        </HelpButton>
      }
    >
      <div className='flex gap-2 shrink-0 mb-2'>
        <SearchInput
          ref={searchInputRef}
          className='flex-1'
          onValueChange={setSearchValue}
          onIdChange={setSelectedId}
          fetchOptions={handleFetchOptions}
          disabled={generating}
          placeholder='通过名称查找或直接输入批评空间创作者id开始生成'
        />
        <Button
          icon={<ImportOutlined />}
          disabled={generating}
          onClick={() => setTemplateModalOpen(true)}
        >
          从模板获取
        </Button>
        <Button
          type='primary'
          icon={<CheckOutlined />}
          loading={generating}
          disabled={!canConfirm}
          onClick={handleConfirm}
        >
          开始生成
        </Button>
      </div>

      {hasSourceData && (
        <Splitter className='flex-1 min-h-0 px-4 pb-4'>
          {/* 左侧：生成代码 */}
          <Splitter.Panel
            defaultSize='60%'
            min='30%'
            className='flex flex-col min-w-0'
          >
            <CodePanel
              variant='inset'
              text={wikitext}
              loading={regenerating}
              loadingDescription='正在查询萌娘百科信息...'
            />
          </Splitter.Panel>

          {/* 右侧：数据表格 */}
          <Splitter.Panel
            defaultSize='40%'
            min='20%'
            max='70%'
            collapsible={{ start: true, showCollapsibleIcon: true }}
            className='flex flex-col min-w-0'
          >
            <DataTablePanel
              header='批评空间原始数据'
              sections={tableSections}
            />
          </Splitter.Panel>
        </Splitter>
      )}

      {!hasSourceData && wikitext && (
        <div className='flex-1 min-h-0 px-4 pb-4'>
          <div className='flex flex-col h-full'>
            <CodePanel
              variant='standalone'
              text={wikitext}
              loading={regenerating}
              loadingDescription='正在查询萌娘百科信息...'
            />
          </div>
        </div>
      )}

      {!hasSourceData && !wikitext && (
        <EmptyPlaceholder />
      )}

      <TemplateLinkModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        onSelect={(name) => searchInputRef.current?.setValueAndSearch(name)}
      />
    </Page>
  );
}
