import { useState, useRef, useMemo, useEffect } from 'react';
import { AutoComplete, Input, Button, App, Table, Result, Splitter, Typography, Tooltip, Spin, Modal } from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import { CheckOutlined, CopyOutlined, ImportOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import Page from '@/components/page';
import {
  useArticleStore,
  fetchPageInfo,
  type Article,
  type PageInfo,
} from '@/stores/articleStore';
import { queryCreatorWorks, searchCreators } from '@/api/erogamescape';
import TemplateLinkModal from './TemplateLinkModal';
import type { GameRecord } from '@/lib/types';
import { shokushuDetailLabels } from '@/lib/erogamescapeDict';
import { PENDING_SELL_DATE } from '@/utils/constants';
import { normalizePunctuation, buildJapaneseNameTemplate, isNumeric, generateExternalLinksWikitext } from '@/utils/text';
import { generateCVWikitext, generateMusicWikitable } from './generateWikitext';

function CopyButton({ text }: { text: string }) {
  const { message } = App.useApp();
  return (
    <Tooltip title='复制到剪贴板'>
      <Button
        type='text'
        size='small'
        icon={<CopyOutlined />}
        onClick={async () => {
          try {
            await writeText(text);
            message.success('已复制到剪贴板');
          } catch (e) {
            message.error(`复制失败: ${e instanceof Error ? e.message : e}`);
          }
        }}
      >
        复制
      </Button>
    </Tooltip>
  );
}

function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      title='使用帮助'
      footer={null}
      onCancel={onClose}
      width={620}
    >
      <ul className='pl-4 m-0 list-disc'>
        <li>作品内链根据条目统计及重定向页判断添加，出现续作、特殊符号等会导致判断不到，需要手动添加。</li>
        <li>角色内链根据名称获取站内页面名称，遇到假名等就查不到。</li>
        <li>声优信息模板和大家族模板默认填写女性，如果是男性声优要自己改。</li>
        <li>批评空间提供的声优名假名不带空格；“汉字姓＋假名名”的形式已自动拆分为 <code>{'{{日本人名|姓|姓假名|名}}'}</code>，其余情况仍需自行调整</li>
        <li>批评空间会把全角！？一律转换成半角，这里一律改全角，可能也要另外确认。</li>
      </ul>
    </Modal>
  );
}

type TableGameRecord = GameRecord & { key: string };

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

interface CreatorOption {
  value: string;
  label: React.ReactNode;
  creatorId: string;
}

const toTableData = (records: GameRecord[]) => {
  return records.map((r, i) => ({ ...r, key: String(i) }));
};

/** 构建批评空间游戏名到条目名的映射 */
const buildGameArticleMap = (articles: Article[]) => {
  const map = new Map<string, string>();
  for (const a of articles) {
    if (a.redirect) {
      continue;
    }
    const normJa = normalizePunctuation(a.ja);
    const normTitle = normalizePunctuation(a.title);
    map.set(normJa, a.title);
    map.set(normTitle, a.title);
    for (const r of a.redirects || []) {
      map.set(normalizePunctuation(r), a.title);
    }
  }
  return map;
};


export default function CvGenerator() {
  const { message } = App.useApp();
  const navigate = useNavigate();

  const articles = useArticleStore((s) => s.articles);
  const updatedAt = useArticleStore((s) => s.updatedAt);

  const gameArticleMap = useMemo(() => buildGameArticleMap(articles), [articles]);
  const [searchValue, setSearchValue] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [options, setOptions] = useState<CreatorOption[]>([]);
  // 搜索中状态：仅影响输入框 suffix 的「搜索中...」提示
  const [searching, setSearching] = useState(false);
  // 生成中状态：仅影响「开始生成」按钮的 loading
  const [generating, setGenerating] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 组件卸载时清理挂起的防抖定时器，避免卸载后仍触发搜索 setState
  useEffect(() => () => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
  }, []);

  // 出演角色数据
  const [acting, setActing] = useState<GameRecord[]>([]);
  // 音乐作品数据
  const [music, setMusic] = useState<GameRecord[]>([]);
  const actingTableData = useMemo(() => toTableData(acting), [acting]);
  const musicTableData = useMemo(() => toTableData(music), [music]);
  // 生成的代码
  const [wikitext, setWikitext] = useState('');
  // 代码生成中状态
  const [wikiLoading, setWikiLoading] = useState(false);
  // 显示帮助弹窗
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  // 显示模板链接弹窗
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  const doSearch = async (value: string) => {
    setSearching(true);
    try {
      const results = await searchCreators(value);
      setOptions(
        results.map((item) => ({
          value: item.name,
          label: `${item.name} - 配音${item.voice_count}丨音乐${item.music_count}`,
          creatorId: String(item.id),
        })),
      );
    } catch (e) {
      message.error(`搜索失败: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchValue(value);
    setSelectedId(null);
    setSearching(false);

    // 清除上一次挂起的防抖定时器，避免快速连续输入时触发多次搜索
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }

    // 空输入或纯数字 id 时直接清空选项
    if (!value.trim() || isNumeric(value)) {
      setOptions([]);
      return;
    }

    // 防抖：用户停止输入 500ms 后发起搜索
    searchTimeoutRef.current = setTimeout(() => {
      doSearch(value);
    }, 500);
  };

  const handleSelect = (_value: string, option: CreatorOption) => {
    setSelectedId(option.creatorId);
  };

  const canConfirm = !!selectedId || isNumeric(searchValue.trim());

  const handleConfirm = async () => {
    const id = selectedId ?? (isNumeric(searchValue) ? searchValue.trim() : null);
    if (!id) {
      return;
    }

    // 取消可能挂起的搜索，避免生成期间输入框残留搜索中提示
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    setSearching(false);

    // 清空已有数据
    setActing([]);
    setMusic([]);
    setWikitext('');

    setGenerating(true);
    try {
      const result = await queryCreatorWorks(Number(id));
      setActing(result.acting);
      setMusic(result.music);
      if (result.acting.length === 0 && result.music.length === 0) {
        message.info('未查询到数据');
        return;
      }

      // 收集所有唯一角色名，查询页面信息
      const charNames = new Set<string>();
      for (const r of [...result.acting, ...result.music]) {
        const raw = r.shubetuDetailName.replace(/\s+/g, ''); // 去掉空格
        if (!raw) { continue; }
        for (const name of raw.split('、').filter(Boolean)) {
          charNames.add(name);
        }
      }
      let pageInfoMap: Map<string, PageInfo> | undefined;
      if (charNames.size > 0) {
        setWikiLoading(true);
        try {
          pageInfoMap = await fetchPageInfo([...charNames]);
        } catch {
          message.warning('获取角色页面信息失败，生成的条目文本将不包含内链');
        } finally {
          setWikiLoading(false);
        }
      }

      // 组装完整 wikitext
      const sections: string[] = [];

      // 欢迎编辑模板
      sections.push('{{欢迎编辑}}');

      // 长期关注及更新模板：最近2年内>3部作品 且 最近1年内>=1部作品
      const allRecords = [...result.acting, ...result.music];
      const currentYear = dayjs().year();
      const countRecentWorks = (yearsAgo: number) =>
        allRecords.filter((r) => {
          if (!r.sellDay || r.sellDay === PENDING_SELL_DATE) { return false; }
          return dayjs(r.sellDay, 'YYYY-MM-DD', true).year() >= currentYear - yearsAgo;
        }).length;
      if (countRecentWorks(2) > 3 && countRecentWorks(1) >= 1) {
        sections.push('{{长期关注及更新}}');
      }

      const { creatorInfo } = result;
      const nameWithFurigana = creatorInfo.furigana
        ? buildJapaneseNameTemplate(creatorInfo.name, creatorInfo.furigana)
        : creatorInfo.name;
      sections.push(
        '{{声优信息',
        `|姓名=${nameWithFurigana}`,
        '|image=',
        '|图片信息=',
        '|其它艺名=',
        '|昵称=',
        '|性别=女',
        '|国籍=日本',
        '|配演语言=日语',
        '|出身地区=',
        '|所属公司=',
        '|出道角色=',
        '|代表角色=',
        '|本体=',
        '}}',
        `'''${creatorInfo.name}'''是日本的女性声优，多从事[[成人游戏]]的配音工作。`,
        '',
        '== 出演作品 ==',
        "主要角色以'''粗体'''显示。",
        '',
        '=== 游戏 ===',
        generateCVWikitext(result.acting, gameArticleMap, pageInfoMap),
      );

      const musicText = generateMusicWikitable(result.music, gameArticleMap);
      if (musicText) {
        sections.push('== 音乐作品 ==', musicText);
      }

      // 注释及外部链接
      const externalLinks = generateExternalLinksWikitext(creatorInfo);
      sections.push(
        '',
        '{{R-18作品声优索引|女}}',
        '',
        '== 注释及外部链接 ==',
        '<references />',
      );
      if (externalLinks) {
        sections.push(externalLinks);
      }

      setWikitext(sections.join('\n'));
      message.success('生成完成');
    } catch (e) {
      message.error(`查询失败: ${e instanceof Error ? e.message : e}`);
    } finally {
      setGenerating(false);
    }
  };

  if (!updatedAt) {
    return (
      <Page
        actions={
          <Tooltip title='使用帮助'>
            <Button
              type='text'
              icon={<QuestionCircleOutlined />}
              onClick={() => setHelpModalOpen(true)}
            />
          </Tooltip>
        }
      >
        <Result
          status='warning'
          title='未获取条目数据'
          subTitle='条目统计数据为空，生成条目时可能无法正常生成内链等信息。建议先前往条目统计页面获取数据。'
          extra={[
            <Button
              key='continue'
              type='primary'
              onClick={() => useArticleStore.setState({ updatedAt: ' ' })}
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
        <Tooltip title='使用帮助'>
          <Button
            type='text'
            icon={<QuestionCircleOutlined />}
            onClick={() => setHelpModalOpen(true)}
          />
        </Tooltip>
      }
    >
      {/* 顶部搜索栏 */}
      <div className='flex gap-2 shrink-0 mb-2'>
        <AutoComplete
          className='flex-1'
          options={options}
          showSearch={{ onSearch: handleSearch, filterOption: false }}
          onSelect={handleSelect}
          value={searchValue}
          onChange={setSearchValue}
          placeholder='通过名称查找或直接输入批评空间创作者id开始生成'
        >
          <Input
            disabled={generating}
            suffix={searching ? <span className='text-xs text-gray-400'>搜索中...</span> : <span />}
          />
        </AutoComplete>
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

      {(acting.length > 0 || music.length > 0) && (
        <Splitter className='flex-1 min-h-0 px-4 pb-4'>
          {/* 左侧：生成代码 */}
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
              {wikiLoading ? (
                <div className='flex items-center justify-center h-full'>
                  <Spin description='正在查询角色页面信息...' />
                </div>
              ) : wikitext}
            </pre>
          </Splitter.Panel>

          {/* 右侧：数据表格 */}
          <Splitter.Panel
            defaultSize='40%'
            min='20%'
            max='70%'
            collapsible={{ start: true, showCollapsibleIcon: true }}
            className='flex flex-col min-w-0'
          >
            <div className='flex items-center justify-between shrink-0 px-1 h-6'>
              <Typography.Text strong>批评空间原始数据</Typography.Text>
            </div>
            <div className='overflow-auto flex-1 min-h-0 border border-(--ant-color-border)'>
              {acting.length > 0 && (
                <>
                  <Typography.Text strong>出演作品</Typography.Text>
                  <Table
                    columns={gameColumns}
                    dataSource={actingTableData}
                    size='small'
                    pagination={false}
                  />
                </>
              )}
              {music.length > 0 && (
                <>
                  <Typography.Text strong>音乐作品</Typography.Text>
                  <Table
                    columns={musicColumns}
                    dataSource={musicTableData}
                    size='small'
                    pagination={false}
                  />
                </>
              )}
            </div>
          </Splitter.Panel>
        </Splitter>
      )}

      {/* 没有表格数据时，仅展示代码 */}
      {!(acting.length > 0 || music.length > 0) && wikitext && (
        <div className='flex-1 min-h-0 px-4 pb-4'>
          <div className='flex flex-col h-full'>
            <div className='flex items-center justify-between mb-2 shrink-0 px-1'>
              <Typography.Text strong>生成结果</Typography.Text>
              <CopyButton text={wikitext} />
            </div>
            <pre className='bg-(--ant-color-bg-elevated) border border-(--ant-color-border) rounded-lg p-4 text-sm overflow-auto whitespace-pre-wrap m-0 leading-relaxed flex-1 min-h-0'>
              {wikitext}
            </pre>
          </div>
        </div>
      )}

      <HelpModal open={helpModalOpen} onClose={() => setHelpModalOpen(false)} />

      <TemplateLinkModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        onSelect={(name) => { setSearchValue(name); doSearch(name); }}
      />
    </Page>
  );
}
