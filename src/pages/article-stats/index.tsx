import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
  Table,
  Button,
  Tooltip,
  Tag,
  Modal,
  Popover,
  App,
  Form,
  type TableColumnsType,
} from 'antd';
import {
  CloudDownloadOutlined,
  FilterOutlined,
  ReloadOutlined,
  TagsOutlined,
  EnterOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { uniq } from 'es-toolkit';
import { useTranslation } from 'react-i18next';
import Page from '@/components/page';
import MoegirlLink from '@/components/moegirl-link';
import { useArticleStore, initArticles, type Article } from '@/stores/article-store';
import { useSettingsStore } from '@/stores/settings-store';
import { formatError } from '@/utils/error';
import UpdateCheckModal from './update-check-modal';
import FilterPanel, { filterInitialValues, type FilterValues } from './filter-panel';
import CategoryPanel, { type CategorySelection } from './category-panel';
import './index.css';

/** 当前展开的筛选面板 */
type ActivePanel = 'filter' | 'category' | null;

export default function ArticleStats() {
  const { message, modal } = App.useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();

  // 表格列定义依赖 t，随界面语言变化重建
  const columns: TableColumnsType<Article> = useMemo(() => [
    {
      title: t('原名'),
      dataIndex: 'ja',
      key: 'ja',
    },
    {
      title: t('条目名'),
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
      title: t('制作组织'),
      dataIndex: 'brand',
      key: 'brand',
    },
    {
      title: t('分类'),
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
      title: t('重定向'),
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
      title: t('发行时间'),
      dataIndex: 'releaseDate',
      key: 'releaseDate',
      width: 120,
      sorter: (a, b) => a.releaseDate.localeCompare(b.releaseDate),
    },
    {
      title: t('创建时间'),
      dataIndex: 'creationDate',
      key: 'creationDate',
      width: 120,
      defaultSortOrder: 'ascend',
      sorter: (a, b) => a.creationDate.localeCompare(b.creationDate),
    },
  ], [t]);

  // ─── Store 数据 ───
  const articles = useArticleStore((s) => s.articles);
  const updatedAt = useArticleStore((s) => s.updatedAt);
  const loading = useArticleStore((s) => s.loading);
  const checking = useArticleStore((s) => s.checking);
  const feishuStatsTableAppId = useSettingsStore((s) => s.feishuStatsTableAppId);
  const feishuStatsTableAppSecret = useSettingsStore((s) => s.feishuStatsTableAppSecret);
  const articlePageSize = useSettingsStore((s) => s.articlePageSize);
  const setArticlePageSize = useSettingsStore((s) => s.setArticlePageSize);

  // 显示的筛选区
  const [activePanel, setActivePanel] = useState<ActivePanel>('filter');

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

  // ─── 检查更新弹窗 ───
  const [updateCheckOpen, setUpdateCheckOpen] = useState(false);

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

  // ─── 条件筛选 ───
  const [form] = Form.useForm<FilterValues>();
  const [filterValues, setFilterValues] = useState<FilterValues>(filterInitialValues);

  // ─── 分类筛选 ───
  const [categorySelection, setCategorySelection] = useState<CategorySelection>({ selected: [], mode: 'or' });

  /** 制作组织集合，用于条件过滤选项 */
  const allBrands = useMemo(
    () => uniq(articles.map((a) => a.brand).filter(Boolean)).sort(),
    [articles],
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
      const { selected: selectedCategories, mode: categoryMode } = categorySelection;
      if (selectedCategories.length > 0) {
        if (categoryMode === 'and') {
          if (!selectedCategories.every((c) => a.categories.includes(c))) { return false; }
        } else {
          if (!selectedCategories.some((c) => a.categories.includes(c))) { return false; }
        }
      }

      return true;
    });
  }, [articles, filterValues, categorySelection]);

  /** 校验飞书配置，缺失时弹窗引导前往设置 */
  const ensureFeishuConfig = () => {
    if (feishuStatsTableAppId && feishuStatsTableAppSecret) { return true; }
    modal.confirm({
      title: t('缺少配置'),
      content: t('请先在设置页面填写飞书 App ID 和 App Secret'),
      okText: t('前往设置'),
      cancelText: t('取消'),
      onOk: () => {
        navigate('/settings#feishu');
      },
    });
    return false;
  };

  /** 打开检查更新弹窗并开始增量检测 */
  const handleCheckUpdates = () => {
    if (!ensureFeishuConfig()) { return; }
    setUpdateCheckOpen(true);
    useArticleStore.getState().checkUpdates(feishuStatsTableAppId, feishuStatsTableAppSecret)
      .then((count) => {
        if (count > 0) {
          message.success(t('检测到 {{count}} 个候选条目，请完善后提交', { count }));
        } else {
          message.info(t('没有检测到新条目'));
          setUpdateCheckOpen(false);
        }
      })
      .catch((err) => {
        setUpdateCheckOpen(false);
        message.error(formatError(err), 5);
      });
  };

  /** 候选提交成功后刷新统计数据 */
  const handleUpdateSubmitted = async () => {
    try {
      await useArticleStore.getState().fetchFeishuTable(feishuStatsTableAppId, feishuStatsTableAppSecret);
      await useArticleStore.getState().fetchPageData();
    } catch (err) {
      message.error(formatError(err), 5);
    }
  };

  /** 更新数据 */
  const handleRefresh = async () => {
    if (!ensureFeishuConfig()) { return; }
    try {
      await useArticleStore.getState().fetchFeishuTable(feishuStatsTableAppId, feishuStatsTableAppSecret);
      message.success(t('获取条目列表成功，正在获取分类和重定向信息…'));
      await useArticleStore.getState().fetchPageData();
      message.success(t('数据更新成功'));
    } catch (err) {
      message.error(formatError(err), 5);
    }
  };

  /** 切换筛选面板 */
  const togglePanel = (panel: ActivePanel) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  const handleResetFilter = () => {
    form.resetFields();
    setFilterValues(filterInitialValues);
  };

  return (
    <Page
      className='flex flex-col'
      padding={false}
      subtitle={updatedAt ? t('最近更新：{{time}}', { time: dayjs(updatedAt).format('YYYY年M月D日 HH:mm') }) : undefined}
      actions={
        <>
          <Tooltip title={t('条件筛选')}>
            <Button
              variant='outlined'
              color={activePanel === 'filter' ? 'primary' : undefined}
              icon={<FilterOutlined />}
              onClick={() => togglePanel('filter')}
            />
          </Tooltip>
          <Tooltip title={t('分类筛选')}>
            <Button
              variant='outlined'
              color={activePanel === 'category' ? 'primary' : undefined}
              icon={<TagsOutlined />}
              onClick={() => togglePanel('category')}
            />
          </Tooltip>
          <Tooltip title={t('检查更新')}>
            <Button
              variant='outlined'
              icon={<CloudDownloadOutlined />}
              loading={checking}
              disabled={checking || updateCheckOpen || loading}
              onClick={handleCheckUpdates}
            />
          </Tooltip>
          <Tooltip title={t('更新')}>
            <Button
              variant='outlined'
              icon={<ReloadOutlined />}
              loading={loading}
              disabled={checking || updateCheckOpen}
              onClick={handleRefresh}
            />
          </Tooltip>
        </>
      }
    >
      {activePanel === 'filter' && (
        <FilterPanel
          form={form}
          allBrands={allBrands}
          onValuesChange={setFilterValues}
          onReset={handleResetFilter}
        />
      )}

      {activePanel === 'category' && (
        <CategoryPanel
          articles={articles}
          value={categorySelection}
          onChange={setCategorySelection}
        />
      )}

      <div ref={tableContainerRef} className='flex-1! min-h-0 overflow-hidden flex flex-col p-3'>
        <Table
          columns={columns}
          dataSource={filteredArticles}
          size='small'
          bordered={false}
          pagination={{
            pageSize: articlePageSize,
            showTotal: (total) => t('共 {{total}} 条', { total }),
            onChange: (_page: number, pageSize: number) => {
              setArticlePageSize(pageSize);
            },
          }}
          virtual
          scroll={{ y: tableHeight }}
          locale={{ emptyText: t('暂无数据') }}
          rowKey={(record) => `${record.ja}-${record.title}`}
          className='article-stats-table flex-1!'
        />
      </div>

      <Modal
        open={!!updateModalOpen}
        title={t('数据更新提示')}
        okText={t('更新')}
        cancelText={t('取消')}
        onOk={() => {
          setUpdateModalOpen(false);
          handleRefresh();
        }}
        onCancel={() => setUpdateModalOpen(false)}
      >
        {articles.length === 0
          ? t('当前暂无条目数据，是否立即获取？')
          : t('上次数据更新于{{time}}（{{days}}天前），是否更新？', {
            time: dayjs(updatedAt).format('YYYY年M月D日 HH:mm'),
            days: updateModalOpen,
          })}
      </Modal>

      <UpdateCheckModal
        open={updateCheckOpen}
        onClose={() => setUpdateCheckOpen(false)}
        onSubmitted={handleUpdateSubmitted}
      />
    </Page>
  );
}
