import { useMemo, useState } from 'react';
import {
  App,
  Button,
  DatePicker,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  type TableColumnsType,
} from 'antd';
import { CloudUploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import feishu, { type FeishuAppendRow } from '@/api/feishu';
import MoegirlLink from '@/components/moegirl-link';
import { useArticleStore, type UpdateCandidate } from '@/stores/article-store';
import { useSettingsStore } from '@/stores/settings-store';
import { formatError } from '@/utils/text';

interface UpdateCheckModalProps {
  /** 弹窗是否可见 */
  open: boolean;
  /** 关闭弹窗的回调 */
  onClose: () => void;
  /** 提交成功后的回调，用于刷新统计数据 */
  onSubmitted: () => Promise<void>;
}

/** 候选行允许编辑的字段 */
type RowPatch = Partial<Pick<UpdateCandidate, 'ja' | 'brand' | 'releaseDate'>>;

/** 检查更新弹窗：展示增量检测出的候选条目，完善信息后提交到飞书统计表 */
export default function UpdateCheckModal({ open, onClose, onSubmitted }: UpdateCheckModalProps) {
  const { message } = App.useApp();

  // ─── Store 数据 ───
  const candidates = useArticleStore((s) => s.candidates);
  const checking = useArticleStore((s) => s.checking);
  const clearCandidates = useArticleStore((s) => s.clearCandidates);
  const feishuStatsTableAppId = useSettingsStore((s) => s.feishuStatsTableAppId);
  const feishuStatsTableAppSecret = useSettingsStore((s) => s.feishuStatsTableAppSecret);

  // ─── 编辑与勾选状态 ───
  /** 行编辑覆盖层：标题 -> 字段补丁，展示行由此合并生成 */
  const [edits, setEdits] = useState<Record<string, RowPatch>>({});
  /** 手动勾选后的键集合；null 表示未手动操作（视为全选） */
  const [selectedKeys, setSelectedKeys] = useState<string[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /** 展示行：候选数据叠加编辑补丁 */
  const rows = useMemo(
    () => candidates.map((candidate) => ({ ...candidate, ...(edits[candidate.title] ?? {}) })),
    [candidates, edits],
  );

  const effectiveSelectedKeys = selectedKeys ?? candidates.map((candidate) => candidate.title);

  /**
   * 更新某一行的可编辑字段
   * @param title 行标识（条目名）
   * @param patch 待合并的字段
   */
  const updateRow = (title: string, patch: RowPatch) => {
    setEdits((prev) => ({
      ...prev,
      [title]: { ...(prev[title] ?? {}), ...patch },
    }));
  };

  /** 重置本地编辑与勾选状态（提交成功或关闭弹窗时调用） */
  const resetLocalState = () => {
    setEdits({});
    setSelectedKeys(null);
  };

  /** 关闭弹窗并重置本地状态 */
  const handleClose = () => {
    resetLocalState();
    onClose();
  };

  /** 将勾选的候选行按创建时间升序提交到统计表 */
  const handleSubmit = async () => {
    const chosen = rows.filter((row) => effectiveSelectedKeys.includes(row.title));
    if (chosen.length === 0) {
      message.warning('请先勾选要提交的条目');
      return;
    }
    setSubmitting(true);
    try {
      const { articles } = useArticleStore.getState();
      const sorted = [...chosen].sort((a, b) => a.creationDate.localeCompare(b.creationDate));
      const appendRows: FeishuAppendRow[] = sorted.map((row) => ({
        original_name: row.ja.trim(),
        title: row.title.trim(),
        brand: row.brand.trim(),
        release_date: row.releaseDate,
        creation_date: row.creationDate,
      }));
      const appendResult = await feishu.appendRows(
        feishuStatsTableAppId,
        feishuStatsTableAppSecret,
        articles.length,
        appendRows,
      );
      if (appendResult.style_warnings.length > 0) {
        message.warning(
          `已追加 ${chosen.length} 条数据，但样式设置失败，请检查线上表格。${appendResult.style_warnings[0]}`,
          8,
        );
      } else {
        message.success(`已向统计表追加 ${chosen.length} 条数据，正在刷新本地缓存…`);
      }
      clearCandidates();
      resetLocalState();
      await onSubmitted();
      onClose();
    } catch (err) {
      message.error(formatError(err), 6);
    } finally {
      setSubmitting(false);
    }
  };

  const columns: TableColumnsType<UpdateCandidate> = [
    {
      title: '条目名',
      dataIndex: 'title',
      render: (_, record) => <MoegirlLink title={record.title} />,
    },
    {
      title: '原名',
      dataIndex: 'ja',
      width: 190,
      render: (_, record) => (
        <Input
          size='small'
          value={record.ja}
          placeholder='日文原名'
          onChange={(e) => updateRow(record.title, { ja: e.target.value })}
        />
      ),
    },
    {
      title: '制作组织',
      dataIndex: 'brand',
      width: 150,
      render: (_, record) => (
        <Input
          size='small'
          value={record.brand}
          onChange={(e) => updateRow(record.title, { brand: e.target.value })}
        />
      ),
    },
    {
      title: '发行时间',
      dataIndex: 'releaseDate',
      width: 130,
      render: (_, record) => (
        <DatePicker
          size='small'
          className='w-full!'
          allowClear
          value={dayjs(record.releaseDate, 'YYYY-MM-DD', true).isValid()
            ? dayjs(record.releaseDate)
            : null}
          placeholder='未识别'
          onChange={(_date, dateString) => updateRow(record.title, { releaseDate: String(dateString) })}
        />
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'creationDate',
      width: 100,
    },
    {
      title: '分类',
      dataIndex: 'categories',
      render: (_, record) => (
        <div className='flex flex-wrap gap-1'>
          {record.categories.map((c) => <Tag key={c}>{c}</Tag>)}
        </div>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      title='检查更新'
      width={1000}
      maskClosable={false}
      onCancel={handleClose}
      footer={
        <Space>
          <Button disabled={submitting} onClick={handleClose}>取消</Button>
          <Button
            type='primary'
            icon={<CloudUploadOutlined />}
            loading={submitting}
            disabled={checking}
            onClick={handleSubmit}
          >
            提交所选（{effectiveSelectedKeys.length}）
          </Button>
        </Space>
      }
    >
      <Table
        columns={columns}
        dataSource={rows}
        rowKey='title'
        size='small'
        loading={checking}
        pagination={false}
        scroll={{ y: 420 }}
        locale={{ emptyText: checking ? '正在检测新条目…' : '没有检测到新条目' }}
        rowSelection={{
          selectedRowKeys: effectiveSelectedKeys,
          onChange: (keys) => setSelectedKeys(keys.map(String)),
        }}
      />
    </Modal>
  );
}
