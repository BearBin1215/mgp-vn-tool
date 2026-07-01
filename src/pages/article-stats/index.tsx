import { useEffect, useState, useMemo, useRef } from 'react';
import { uniq } from 'lodash-es';
import {
  Table,
  Button,
  Tooltip,
  Input,
  Select,
  DatePicker,
  Typography,
  Space,
  Form,
  Row,
  Col,
  Tag,
  Radio,
  Modal,
  Popover,
  App,
  type TableColumnsType,
} from 'antd';
import {
  FilterOutlined,
  ReloadOutlined,
  TagsOutlined,
  ClearOutlined,
  UndoOutlined,
  EnterOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router';
import Page from '@/components/page';
import MoegirlLink from '@/components/MoegirlLink';
import { useArticleStore, initArticles, type Article } from '@/stores/articleStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import './index.css';

const { RangePicker } = DatePicker;

/** 预设分类 */
const presetCategories = ['恋爱冒险游戏', '视觉小说', '冒险游戏'];

const columns: TableColumnsType<Article> = [
  {
    title: '原名',
    dataIndex: 'ja',
    key: 'ja',
  },
  {
    title: '条目名',
    dataIndex: 'title',
    key: 'title',
    render: (_, record) => record.redirect ? (
      <>
        <MoegirlLink title={record.title} params={{ redirect: 'no' }}>
          <i>{record.title}</i>
        </MoegirlLink>
        →
        <MoegirlLink title={record.redirect} />
      </>
    ) : <MoegirlLink title={record.title} />,
  },
  {
    title: '制作组织',
    dataIndex: 'brand',
    key: 'brand',
  },
  {
    title: '分类',
    dataIndex: 'categories',
    key: 'categories',
    render: (_, record) => {
      /** 游戏平台分类折叠起来放进 `+N` 标签内 */
      const platformCategories = (record.categories || []).filter((c) => c.endsWith('游戏') && !c.endsWith('冒险游戏'));
      const otherCategories = (record.categories || []).filter((c) => !(c.endsWith('游戏') && !c.endsWith('冒险游戏')));
      return (
        <div className='flex flex-wrap gap-1'>
          {otherCategories.map((c) => <Tag key={c}>{c}</Tag>)}
          {platformCategories.length === 1 && <Tag>{platformCategories[0]}</Tag>}
          {platformCategories.length > 1 && (
            <Popover
              content={
                <div className='flex flex-wrap gap-1 max-w-80'>
                  {platformCategories.map((c) => <Tag key={c}>{c}</Tag>)}
                </div>
              }
            >
              <Tag className='cursor-default' color='processing'>+{platformCategories.length}</Tag>
            </Popover>
          )}
        </div>
      );
    },
  },
  {
    title: '重定向',
    dataIndex: 'redirects',
    key: 'redirects',
    width: 80,
    align: 'center',
    render: (_, record) => record.redirects?.length ? (
      <Tooltip
        title={
          <ul className='pl-4 m-0 list-disc'>
            {record.redirects.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        }
      >
        <span className='cursor-default inline-flex items-center gap-1'>
          <EnterOutlined />
          {record.redirects.length}
        </span>
      </Tooltip>
    ) : null,
  },
  {
    title: '发行时间',
    dataIndex: 'releaseDate',
    key: 'releaseDate',
    width: 120,
    sorter: (a, b) => a.releaseDate.localeCompare(b.releaseDate),
  },
  {
    title: '创建时间',
    dataIndex: 'creationDate',
    key: 'creationDate',
    width: 120,
    defaultSortOrder: 'ascend',
    sorter: (a, b) => a.creationDate.localeCompare(b.creationDate),
  },
];

interface FilterValues {
  name: string;
  brands: string[];
  releaseDateRange: [Dayjs | null, Dayjs | null] | null;
  creationDateRange: [Dayjs | null, Dayjs | null] | null;
}

const initialValues: FilterValues = {
  name: '',
  brands: [],
  releaseDateRange: null,
  creationDateRange: null,
};

type FilterPanel = 'filter' | 'category' | null;

export default function ArticleStats() {
  // ─── Store 数据 ───
  const articles = useArticleStore((s) => s.articles);
  const updatedAt = useArticleStore((s) => s.updatedAt);
  const loading = useArticleStore((s) => s.loading);
  const feishuStatsTableAppId = useSettingsStore((s) => s.feishuStatsTableAppId);
  const feishuStatsTableAppSecret = useSettingsStore((s) => s.feishuStatsTableAppSecret);
  const articlePageSize = useSettingsStore((s) => s.articlePageSize);
  const setArticlePageSize = useSettingsStore((s) => s.setArticlePageSize);

  // 显示的筛选区
  const [activePanel, setActivePanel] = useState<FilterPanel>('filter');

  // ─── 条件筛选 ───
  const [form] = Form.useForm<FilterValues>();
  const [filterValues, setFilterValues] = useState<FilterValues>(initialValues);

  // ─── 分类筛选 ───
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [categoryMode, setCategoryMode] = useState<'and' | 'or'>('or');
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');

  // ─── 表格容器高度（随窗口动态调整） ───
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [tableHeight, setTableHeight] = useState(500);

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) { return; }
    const observer = new ResizeObserver(([entry]) => {
      setTableHeight(entry.contentRect.height - 100);
    });
    observer.observe(el);
    setTableHeight(el.clientHeight - 100);
    return () => observer.disconnect();
  }, []);

  // ─── 更新提醒 ───
  const [updateModalOpen, setUpdateModalOpen] = useState<boolean | number>(false);

  // ─── 初始化 ───
  useEffect(() => {
    initArticles().then(() => {
      const { hasShownUpdateReminder, updatedAt: latestUpdatedAt } = useArticleStore.getState();
      if (hasShownUpdateReminder) { return; }
      if (!latestUpdatedAt) { // 没有上次更新时间，说明未获取过数据，提醒是否更新
        useArticleStore.setState({ hasShownUpdateReminder: true });
        setUpdateModalOpen(true);
        return;
      }
      const diffDays = Math.floor((Date.now() - new Date(latestUpdatedAt).getTime()) / 86400000);
      if (diffDays >= 15) { // 距上次更新时间超过15天，提醒是否更新
        useArticleStore.setState({ hasShownUpdateReminder: true });
        setUpdateModalOpen(diffDays);
      }
    });
  }, []);

  /** 制作组织集合，用于条件过滤选项 */
  const allBrands = useMemo(
    () => uniq(articles.map((a) => a.brand).filter(Boolean)).sort(),
    [articles],
  );

  /** 各分类成员数量 */
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of articles) {
      for (const c of a.categories) {
        counts.set(c, (counts.get(c) || 0) + 1);
      }
    }
    return counts;
  }, [articles]);

  const allCategories = useMemo(() => {
    return uniq([...presetCategories, ...articles.flatMap((a) => a.categories)])
      .sort((a, b) => (categoryCounts.get(b) || 0) - (categoryCounts.get(a) || 0));
  }, [articles, categoryCounts]);

  /** 分类筛选仅展示成员超过5个的分类，最多展示30个，其余放入“全部分类”弹窗 */
  const displayCategories = useMemo(
    () => allCategories.filter((c) => (categoryCounts.get(c) || 0) > 5).slice(0, 30),
    [allCategories, categoryCounts],
  );

  /** 筛选后的条目 */
  const filteredArticles = useMemo(() => {
    const { name, brands, releaseDateRange, creationDateRange } = filterValues;
    return articles.filter((a) => {
      // 条件筛选
      if (name) {
        const q = name.toLowerCase();
        const matchJa = a.ja.toLowerCase().includes(q);
        const matchTitle = a.title.toLowerCase().includes(q);
        const matchRedirect = a.redirects?.some((r) => r.toLowerCase().includes(q));
        if (!matchJa && !matchTitle && !matchRedirect) { return false; }
      }
      if (brands.length > 0 && !brands.includes(a.brand)) { return false; }
      if (releaseDateRange?.[0] && a.releaseDate < releaseDateRange[0].format('YYYY-MM-DD')) { return false; }
      if (releaseDateRange?.[1] && a.releaseDate > releaseDateRange[1].format('YYYY-MM-DD')) { return false; }
      if (creationDateRange?.[0] && a.creationDate < creationDateRange[0].format('YYYY-MM-DD')) { return false; }
      if (creationDateRange?.[1] && a.creationDate > creationDateRange[1].format('YYYY-MM-DD')) { return false; }

      // 分类筛选
      if (selectedCategories.length > 0) {
        if (categoryMode === 'and') {
          if (!selectedCategories.every((c) => a.categories.includes(c))) { return false; }
        } else {
          if (!selectedCategories.some((c) => a.categories.includes(c))) { return false; }
        }
      }

      return true;
    });
  }, [articles, filterValues, selectedCategories, categoryMode]);

  const { message, modal } = App.useApp();
  const navigate = useNavigate();

  /** 更新数据 */
  const handleRefresh = async () => {
    if (!feishuStatsTableAppId || !feishuStatsTableAppSecret) {
      modal.confirm({
        title: '缺少配置',
        content: '请先在设置页面填写飞书 App ID 和 App Secret',
        okText: '前往设置',
        cancelText: '取消',
        onOk: () => {
          navigate('/settings#feishu');
        },
      });
      return;
    }
    try {
      await useArticleStore.getState().fetchFeishuTable(feishuStatsTableAppId, feishuStatsTableAppSecret);
      message.success('获取条目列表成功，正在获取分类和重定向信息…');
      await useArticleStore.getState().fetchPageData();
      message.success('数据更新成功');
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err), 5);
    }
  };

  /** 切换筛选面板 */
  const togglePanel = (panel: FilterPanel) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  const toggleCategory = (cat: string, checked: boolean) => {
    setSelectedCategories((prev) => checked ? [...prev, cat] : prev.filter((c) => c !== cat));
  };

  const handleResetFilter = () => {
    form.resetFields();
    setFilterValues(initialValues);
  };

  return (
    <Page
      className='flex flex-col'
      padding={false}
      subtitle={updatedAt ? `最近更新：${dayjs(updatedAt).format('YYYY年M月D日 HH:mm')}` : undefined}
      actions={
        <>
          <Tooltip title='条件筛选'>
            <Button
              variant='outlined'
              color={activePanel === 'filter' ? 'primary' : undefined}
              icon={<FilterOutlined />}
              onClick={() => togglePanel('filter')}
            />
          </Tooltip>
          <Tooltip title='分类筛选'>
            <Button
              variant='outlined'
              color={activePanel === 'category' ? 'primary' : undefined}
              icon={<TagsOutlined />}
              onClick={() => togglePanel('category')}
            />
          </Tooltip>
          <Tooltip title='更新'>
            <Button
              variant='outlined'
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={handleRefresh}
            />
          </Tooltip>
        </>
      }
    >
      {activePanel === 'filter' && (
        <div
          className={`
            p-4 pb-3 sticky top-0 z-10
            bg-(--ant-color-bg-container)
            border-b border-(--ant-color-border-secondary)
          `}
        >
          <div className='flex items-start gap-4'>
            <Form
              form={form}
              initialValues={initialValues}
              onValuesChange={(_, allValues) => setFilterValues(allValues)}
              layout='horizontal'
              className='flex-1'
            >
              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item name='name' label='作品名称'>
                    <Input placeholder='搜索原名或条目名' />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name='brands' label='制作组织'>
                    <Select
                      mode='multiple'
                      placeholder='搜索或选择'
                      showSearch
                      options={allBrands.map((brand) => ({
                        value: brand,
                        label: brand,
                      }))}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item
                    name='releaseDateRange'
                    label='发行时间'
                    className='mb-2!'
                  >
                    <RangePicker className='w-full' />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name='creationDateRange'
                    label='创建时间'
                    className='mb-2!'
                  >
                    <RangePicker className='w-full' />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
            <Tooltip title='重置'>
              <Button
                variant='outlined'
                icon={<UndoOutlined />}
                onClick={handleResetFilter}
              />
            </Tooltip>
          </div>
        </div>
      )}

      {activePanel === 'category' && (
        <div className='filter-bar p-4 pb-3 sticky top-0 z-10'>
          <div className='flex items-start gap-6'>
            <div className='flex-1'>
              <div className='mb-2 flex items-center gap-2'>
                <Typography.Text type='secondary'>按分类筛选</Typography.Text>
                {allCategories.length > displayCategories.length && (
                  <Button
                    size='small'
                    type='link'
                    onClick={() => setCategoryModalOpen(true)}
                  >
                    全部分类（{allCategories.length}）
                  </Button>
                )}
              </div>
              <div className='flex flex-wrap gap-2'>
                {displayCategories.length === 0 ? (
                  <Typography.Text type='secondary'>暂无分类数据</Typography.Text>
                ) : (
                  displayCategories.map((cat) => (
                    <Tag.CheckableTag
                      key={cat}
                      checked={selectedCategories.includes(cat)}
                      onChange={(checked) => toggleCategory(cat, checked)}
                    >
                      {cat}（{categoryCounts.get(cat) || 0}）
                    </Tag.CheckableTag>
                  ))
                )}
              </div>
            </div>
            <Space>
              <Radio.Group
                value={categoryMode}
                onChange={(e) => setCategoryMode(e.target.value)}
                optionType='button'
                buttonStyle='solid'
              >
                <Radio.Button value='or'>OR</Radio.Button>
                <Radio.Button value='and'>AND</Radio.Button>
              </Radio.Group>
              <Tooltip title='清空'>
                <Button
                  variant='outlined'
                  icon={<ClearOutlined />}
                  onClick={() => {
                    setSelectedCategories([]);
                    setCategoryMode('or');
                  }}
                >
                  清空
                </Button>
              </Tooltip>
            </Space>
          </div>
        </div>
      )}

      <div ref={tableContainerRef} className='flex-1! min-h-0 overflow-hidden flex flex-col p-3'>
        <Table
          columns={columns}
          dataSource={filteredArticles}
          size='small'
          bordered={false}
          pagination={{
            simple: true,
            pageSize: articlePageSize,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (_page: number, pageSize: number) => {
              setArticlePageSize(pageSize);
            },
          }}
          virtual
          scroll={{ y: tableHeight }}
          locale={{ emptyText: '暂无数据' }}
          rowKey={(record) => `${record.ja}-${record.title}`}
          className='article-stats-table flex-1!'
        />
      </div>

      <Modal
        open={!!updateModalOpen}
        title='数据更新提示'
        okText='更新'
        cancelText='取消'
        onOk={() => {
          setUpdateModalOpen(false);
          handleRefresh();
        }}
        onCancel={() => setUpdateModalOpen(false)}
      >
        {articles.length === 0
          ? '当前暂无条目数据，是否立即获取？'
          : `上次数据更新于${dayjs(updatedAt).format('YYYY年M月D日 HH:mm')}（${updateModalOpen}天前），是否更新？`}
      </Modal>

      <Modal
        open={categoryModalOpen}
        title='全部分类'
        footer={null}
        onCancel={() => { setCategoryModalOpen(false); setCategorySearch(''); }}
        width={800}
      >
        <Input
          className='mb-3!'
          placeholder='搜索分类'
          allowClear
          value={categorySearch}
          onChange={(e) => setCategorySearch(e.target.value)}
        />
        <div className='flex flex-wrap gap-2 max-h-96 overflow-auto'>
          {allCategories
            .filter((cat) => !categorySearch || cat.includes(categorySearch))
            .map((cat) => (
              <Tag.CheckableTag
                key={cat}
                checked={selectedCategories.includes(cat)}
                onChange={(checked) => toggleCategory(cat, checked)}
              >
                {cat}（{categoryCounts.get(cat) || 0}）
              </Tag.CheckableTag>
            ))}
        </div>
      </Modal>
    </Page>
  );
}
