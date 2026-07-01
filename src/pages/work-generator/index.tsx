import { useState, useRef, useMemo } from 'react';
import { App, Button, Input, Modal, Tooltip, Typography, Spin, Table, Splitter } from 'antd';
import type { InputRef, TableColumnsType } from 'antd';
import { CheckOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import Page from '@/components/page';
import CopyButton from '@/components/CopyButton';
import EmptyPlaceholder from '@/components/EmptyPlaceholder';
import MoegirlLink from '@/components/MoegirlLink';
import SearchInput, { type SearchInputOption } from '@/components/SearchInput';
import {
  searchGames,
  queryWorkDetail,
  queryWorkMusicDetail,
  type WorkDetail,
  type StaffRecord,
  type WorkTransplant,
} from '@/api/erogamescape';
import { shokushuLabels, shokushuDetailLabels, platforms } from '@/lib/erogamescapeDict';
import { fetchPageInfo, type PageInfo } from '@/stores/articleStore';
import { resolveInputId, normalizePunctuation } from '@/utils/text';
import { PENDING_SELL_DATE } from '@/utils/constants';
import { generateWorkWikitext, parseStaffName } from './generateWikitext';

type TableStaffRecord = StaffRecord & { key: string };
type TableTransplant = WorkTransplant & { key: string };
type TableSequel = { name: string; key: string };

/** STAFF/CAST/音乐 原始数据列 */
const staffColumns: TableColumnsType<TableStaffRecord> = [
  {
    title: '职种',
    dataIndex: 'shubetu',
    key: 'shubetu',
    width: 80,
    render: (value: string) => shokushuLabels[value] || value,
  },
  {
    title: '担当',
    dataIndex: 'shubetuDetail',
    key: 'shubetuDetail',
    width: 80,
    render: (value: string) => shokushuDetailLabels[value] || value,
  },
  {
    title: '详情',
    dataIndex: 'shubetuDetailName',
    key: 'shubetuDetailName',
    width: 200,
  },
  {
    title: '人员',
    dataIndex: 'name',
    key: 'name',
    width: 150,
  },
];

/** 移植版原始数据列 */
const transplantColumns: TableColumnsType<TableTransplant> = [
  {
    title: '平台',
    dataIndex: 'model',
    key: 'model',
    width: 120,
    render: (value: string) => platforms[value]?.label || value,
  },
  {
    title: '发售日期',
    dataIndex: 'sellday',
    key: 'sellday',
    width: 120,
  },
  {
    title: '制作组织',
    dataIndex: 'brand',
    key: 'brand',
  },
];

/** 续作原始数据列 */
const sequelColumns: TableColumnsType<TableSequel> = [
  { title: '游戏名', dataIndex: 'name', key: 'name' },
];

/** 为记录追加 antd Table 所需的稳定 key */
const toTableData = <T,>(records: T[]) => records.map((r, i) => ({ ...r, key: String(i) }));

/** 帮助弹窗 */
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
        <li>本功能以 <MoegirlLink title='Template:页面格式/视觉小说'>Template:页面格式/视觉小说</MoegirlLink> 为模板，生成后可按个人习惯调整格式、措辞等。</li>
        <li>数据来自批评空间，使用前建议前往设置调整批评空间相关网络设置。</li>
        <li>提交前务必认真检查内容，如有错漏本工具不承担责任。</li>
      </ul>
    </Modal>
  );
}

export default function WorkGenerator() {
  const { message } = App.useApp();

  const [searchValue, setSearchValue] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 显示帮助弹窗
  const [helpModalOpen, setHelpModalOpen] = useState(false);

  // 生成中、未获取到数据状态
  const [generating, setGenerating] = useState(false);
  // 代码已展示但仍在后续阶段更新中：作为左侧代码区遮罩开关
  const [regenerating, setRegenerating] = useState(false);
  // 当前渐进生成阶段，驱动遮罩文案
  const [genPhase, setGenPhase] = useState<'wiki' | 'music' | null>(null);

  // 批评空间原始数据
  const [workDetail, setWorkDetail] = useState<WorkDetail | null>(null);

  // STAFF/CAST/音乐 记录：shubetu=5 为声优（CAST），6 为歌手（音乐），其余为 STAFF，分表格展示
  const { castTableData, staffTableData, musicStaffTableData, transplantTableData, sequelTableData } = useMemo(() => {
    if (!workDetail) {
      return { castTableData: [], staffTableData: [], musicStaffTableData: [], transplantTableData: [], sequelTableData: [] };
    }
    return {
      castTableData: toTableData(workDetail.staff.filter((s) => s.shubetu === '5')),
      // STAFF 表排除歌手(6)
      staffTableData: toTableData(workDetail.staff.filter((s) => !['5', '6'].includes(s.shubetu))),
      musicStaffTableData: toTableData(workDetail.staff.filter((s) => s.shubetu === '6')),
      transplantTableData: toTableData(workDetail.transplants),
      sequelTableData: toTableData(workDetail.sequels.map((name) => ({ name }))),
    };
  }, [workDetail]);
  // 是否有源数据表格（与 cv-generator 一致：按具体数据数组判断，决定 Splitter / 仅代码 / 空状态）
  const hasSourceData =
    castTableData.length > 0 ||
    staffTableData.length > 0 ||
    musicStaffTableData.length > 0 ||
    transplantTableData.length > 0 ||
    sequelTableData.length > 0;

  // 生成结果
  const [wikitext, setWikitext] = useState('');

  /** 名称搜索：调用批评空间接口并映射为下拉选项，按发售日从旧到新排列 */
  const handleFetchOptions = async (keyword: string): Promise<SearchInputOption[]> => {
    const results = await searchGames(keyword);
    return results
      .sort((a, b) => a.sellday.localeCompare(b.sellday))
      .map((item) => ({
        value: item.id,
        label: `${item.gamename}（${item.brandname || '未知制作组织'} - ${item.sellday === PENDING_SELL_DATE ? '待定' : (item.sellday || '未知发售日')}）`,
        id: item.id,
        display: item.gamename,
      }));
  };

  // 显示输入条目名弹窗
  const [modalOpen, setModalOpen] = useState(false);
  // 弹窗内输入的条目名
  const [articleName, setArticleName] = useState('');
  const nameInputRef = useRef<InputRef>(null);

  /** 控制点击开始生成按钮 */
  const canConfirm = resolveInputId(selectedId, searchValue) !== null;
  /** 点击「开始生成」：解析作品 id 并打开条目名输入弹窗 */
  const handleConfirm = () => {
    const id = resolveInputId(selectedId, searchValue);
    if (!id) {
      return;
    }
    // 默认条目名取作品原名：下拉选中后输入框即为作品原名；直接输入数字 id 时留空
    // 半角 !? 转全角，与声优条目生成保持一致
    setArticleName(selectedId ? normalizePunctuation(searchValue) : '');
    setModalOpen(true);
  };

  /** 条目名输入弹窗确认：查询作品详情并生成条目顶部 wikitext */
  const handleModalOk = async () => {
    const id = resolveInputId(selectedId, searchValue);
    const name = articleName.trim();
    if (!id || !name) {
      return;
    }
    setModalOpen(false);
    setGenerating(true);
    setRegenerating(true);
    setGenPhase(null);
    setWikitext('');
    setWorkDetail(null);
    try {
      const detail = await queryWorkDetail(+id);
      setWorkDetail(detail);

      // 阶段1：批评空间详情到手，立即用无内链/无音乐版本生成并展示，开启遮罩
      setWikitext(generateWorkWikitext(detail, name));
      setGenPhase('wiki');

      // 收集制作组织名、声优名、歌手名与 STAFF 人员主名（编剧/原画/SD原画/音乐），查询萌百页面信息用于内链重定向解析
      // 其他职种（shubetu=7）不解析内链，故不纳入查询
      const staffMainNames = detail.staff
        .filter((s) => ['1', '2', '3'].includes(s.shubetu))
        .map((s) => parseStaffName(s.name).main);
      const namesToQuery = [
        detail.brand,
        ...detail.transplants.map((t) => t.brand),
        ...detail.staff.filter((s) => ['5', '6'].includes(s.shubetu)).map((s) => parseStaffName(s.name).main),
        ...staffMainNames,
      ].filter(Boolean);
      const uniqueNames = [...new Set(namesToQuery)];
      let pageInfoMap: Map<string, PageInfo> | undefined;
      if (uniqueNames.length > 0) {
        try {
          pageInfoMap = await fetchPageInfo(uniqueNames);
        } catch {
          message.warning('获取页面信息失败，内链将使用原始名称');
        }
      }

      // 阶段2：带内链重新生成
      setWikitext(generateWorkWikitext(detail, name, pageInfoMap));
      setGenPhase('music');

      // 阶段3：获取音乐详情（爬取 game.php + music.php），拿到后用完整版本替换并移除遮罩
      try {
        const musicDetails = await queryWorkMusicDetail(Number(id));
        if (musicDetails.length > 0) {
          setWikitext(generateWorkWikitext(detail, name, pageInfoMap, musicDetails));
        }
      } catch {
        // 静默失败，带内链的版本已展示
      } finally {
        setRegenerating(false);
        setGenPhase(null);
        message.success('生成完成');
      }
    } catch (e) {
      message.error(`查询失败: ${e instanceof Error ? e.message : e}`);
    } finally {
      setGenerating(false);
      setRegenerating(false);
    }
  };

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
      <div className='flex gap-2 shrink-0 mb-2'>
        <SearchInput
          className='flex-1'
          onValueChange={setSearchValue}
          onIdChange={setSelectedId}
          fetchOptions={handleFetchOptions}
          disabled={generating}
          placeholder='通过名称查找或直接输入批评空间作品 id 开始生成'
        />
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

      {/* 生成结果 */}
      {hasSourceData && (
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
            <div className='relative flex-1 min-h-0'>
              <pre
                className={`
                  m-0 p-2 h-full
                  text-sm overflow-auto whitespace-pre-wrap leading-relaxed
                  border border-(--ant-color-border)
                  bg-(--ant-color-bg-elevated)
                `}
              >
                {wikitext}
              </pre>
              {regenerating && (
                <div className='absolute inset-0 flex items-center justify-center bg-(--ant-color-bg-elevated)/60 backdrop-blur-[1px]'>
                  <Spin description={genPhase === 'wiki' ? '正在查询萌娘百科信息...' : '正在获取音乐详情...'} />
                </div>
              )}
            </div>
          </Splitter.Panel>

          {/* 右侧：批评空间原始数据 */}
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
              {castTableData.length > 0 && (
                <>
                  <Typography.Text strong>CAST</Typography.Text>
                  <Table
                    columns={staffColumns}
                    dataSource={castTableData}
                    size='small'
                    pagination={false}
                  />
                </>
              )}
              {staffTableData.length > 0 && (
                <>
                  <Typography.Text strong>STAFF</Typography.Text>
                  <Table
                    columns={staffColumns}
                    dataSource={staffTableData}
                    size='small'
                    pagination={false}
                  />
                </>
              )}
              {musicStaffTableData.length > 0 && (
                <>
                  <Typography.Text strong>关联音乐</Typography.Text>
                  <Table
                    columns={staffColumns}
                    dataSource={musicStaffTableData}
                    size='small'
                    pagination={false}
                  />
                </>
              )}
              {transplantTableData.length > 0 && (
                <>
                  <Typography.Text strong>移植版</Typography.Text>
                  <Table
                    columns={transplantColumns}
                    dataSource={transplantTableData}
                    size='small'
                    pagination={false}
                  />
                </>
              )}
              {sequelTableData.length > 0 && (
                <>
                  <Typography.Text strong>续作</Typography.Text>
                  <Table
                    columns={sequelColumns}
                    dataSource={sequelTableData}
                    size='small'
                    pagination={false}
                  />
                </>
              )}
            </div>
          </Splitter.Panel>
        </Splitter>
      )}

      {/* 没有源数据时，仅展示代码 */}
      {!hasSourceData && wikitext && (
        <div className='flex-1 min-h-0 px-4 pb-4'>
          <div className='flex flex-col h-full'>
            <div className='flex items-center justify-between mb-2 shrink-0 px-1'>
              <Typography.Text strong>生成结果</Typography.Text>
              <CopyButton text={wikitext} />
            </div>
            <div className='relative flex-1 min-h-0'>
              <pre
                className={`
                  m-0 p-4 h-full
                  text-sm overflow-auto whitespace-pre-wrap leading-relaxed
                  bg-(--ant-color-bg-elevated)
                  border border-(--ant-color-border) rounded-lg
                `}
              >
                {wikitext}
              </pre>
              {regenerating && (
                <div className='absolute inset-0 flex items-center justify-center bg-(--ant-color-bg-elevated)/60 backdrop-blur-[1px]'>
                  <Spin description={genPhase === 'wiki' ? '正在查询萌娘百科信息...' : '正在获取音乐详情...'} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 无任何数据时展示空状态占位 */}
      {!hasSourceData && !wikitext && (
        <EmptyPlaceholder />
      )}

      {/* 条目名输入弹窗 */}
      <Modal
        open={modalOpen}
        title='输入条目名'
        okText='确定'
        cancelText='取消'
        okButtonProps={{ disabled: !articleName.trim() }}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
        afterOpenChange={(visible) => { if (visible) { nameInputRef.current?.focus(); } }}
        width={480}
      >
        <Input
          ref={nameInputRef}
          value={articleName}
          onChange={(e) => setArticleName(e.target.value)}
          onPressEnter={handleModalOk}
        />
      </Modal>

      <HelpModal open={helpModalOpen} onClose={() => setHelpModalOpen(false)} />
    </Page>
  );
}
