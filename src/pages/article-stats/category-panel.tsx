import { useMemo, useState } from 'react';
import { uniq } from 'es-toolkit';
import { Button, Input, Modal, Radio, Space, Tag, Tooltip, Typography } from 'antd';
import { ClearOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { Article } from '@/stores/article-store';

/** 预设分类，无论成员数量多少都参与展示排序 */
const PRESET_CATEGORIES = ['恋爱冒险游戏', '视觉小说', '冒险游戏'];

/** 面板直接展示的分类数量上限 */
const DISPLAY_LIMIT = 30;

/** 面板直接展示的分类成员数下限 */
const DISPLAY_MIN_COUNT = 5;

/** 分类筛选结果 */
export interface CategorySelection {
  /** 选中的分类 */
  selected: string[];
  /** 多分类间的组合方式 */
  mode: 'and' | 'or';
}

/** 分类筛选面板参数 */
interface CategoryPanelProps {
  /** 条目列表，用于统计各分类成员数量 */
  articles: Article[];
  /** 当前分类筛选结果（受控） */
  value: CategorySelection;
  /** 分类筛选变化回调 */
  onChange: (selection: CategorySelection) => void;
}

/** 分类筛选面板：高频分类标签、OR/AND 切换与「全部分类」弹窗 */
export default function CategoryPanel({ articles, value, onChange }: CategoryPanelProps) {
  const { t } = useTranslation();
  const { selected, mode } = value;

  // 「全部分类」弹窗状态，仅面板内部使用
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');

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

  /** 全部分类：预设分类置顶，其余按成员数降序 */
  const allCategories = useMemo(() => {
    return uniq([...PRESET_CATEGORIES, ...articles.flatMap((a) => a.categories)])
      .sort((a, b) => (categoryCounts.get(b) || 0) - (categoryCounts.get(a) || 0));
  }, [articles, categoryCounts]);

  /** 仅展示成员数超过下限的分类，其余放入「全部分类」弹窗 */
  const displayCategories = useMemo(
    () => allCategories.filter((c) => (categoryCounts.get(c) || 0) > DISPLAY_MIN_COUNT).slice(0, DISPLAY_LIMIT),
    [allCategories, categoryCounts],
  );

  /** 更新分类筛选结果 */
  const update = (nextSelected: string[], nextMode: 'and' | 'or') => {
    onChange({ selected: nextSelected, mode: nextMode });
  };

  const toggleCategory = (cat: string, checked: boolean) => {
    update(checked ? [...selected, cat] : selected.filter((c) => c !== cat), mode);
  };

  /** 关闭弹窗并清空搜索词 */
  const closeModal = () => {
    setModalOpen(false);
    setSearch('');
  };

  return (
    <div
      className={`
        p-4 pb-3 sticky top-0 z-10
        bg-(--ant-color-bg-container)
        border-b border-(--ant-color-border-secondary)
      `}
    >
      <div className='flex items-start gap-6'>
        <div className='flex-1'>
          <div className='mb-2 flex items-center gap-2'>
            <Typography.Text type='secondary'>{t('按分类筛选')}</Typography.Text>
            {allCategories.length > displayCategories.length && (
              <Button
                size='small'
                type='link'
                onClick={() => setModalOpen(true)}
              >
                {t('全部分类（{{count}}）', { count: allCategories.length })}
              </Button>
            )}
          </div>
          <div className='flex flex-wrap gap-2'>
            {displayCategories.length === 0 ? (
              <Typography.Text type='secondary'>{t('暂无分类数据')}</Typography.Text>
            ) : (
              displayCategories.map((cat) => (
                <Tag.CheckableTag
                  key={cat}
                  checked={selected.includes(cat)}
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
            value={mode}
            onChange={(e) => update(selected, e.target.value)}
            optionType='button'
            buttonStyle='solid'
          >
            <Radio.Button value='or'>OR</Radio.Button>
            <Radio.Button value='and'>AND</Radio.Button>
          </Radio.Group>
          <Tooltip title={t('清空')}>
            <Button
              variant='outlined'
              icon={<ClearOutlined />}
              onClick={() => update([], 'or')}
            >
              {t('清空')}
            </Button>
          </Tooltip>
        </Space>
      </div>

      <Modal
        open={modalOpen}
        title={t('全部分类')}
        footer={null}
        onCancel={closeModal}
        width={800}
      >
        <Input
          className='mb-3!'
          placeholder={t('搜索分类')}
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className='flex flex-wrap gap-2 max-h-96 overflow-auto'>
          {allCategories
            .filter((cat) => !search || cat.includes(search))
            .map((cat) => (
              <Tag.CheckableTag
                key={cat}
                checked={selected.includes(cat)}
                onChange={(checked) => toggleCategory(cat, checked)}
              >
                {cat}（{categoryCounts.get(cat) || 0}）
              </Tag.CheckableTag>
            ))}
        </div>
      </Modal>
    </div>
  );
}
