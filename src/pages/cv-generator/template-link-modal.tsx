import { useState, useMemo } from 'react';
import { App, Button, Input, Table, Modal, type TableColumnsType } from 'antd';
import { CheckOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import moegirl from '@/api/moegirl';
import MoegirlLink from '@/components/moegirl-link';
import { formatError } from '@/utils/text';

interface TemplateLink {
  text: string;
  href: string;
}

interface TemplateLinkModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (name: string) => void;
}

export default function TemplateLinkModal({ open, onClose, onSelect }: TemplateLinkModalProps) {
  const { message } = App.useApp();
  const { t } = useTranslation();
  const [links, setLinks] = useState<TemplateLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(10);

  const filteredLinks = useMemo(() => {
    if (!search) { return links; }
    const q = search.toLowerCase();
    return links.filter((l) => {
      const match = l.href.match(/[?&]title=([^&]*)/);
      const title = match ? decodeURIComponent(match[1]) : l.href;
      return l.text.toLowerCase().includes(q) || title.toLowerCase().includes(q);
    });
  }, [links, search]);

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const res = await moegirl.post({
        action: 'parse',
        text: '{{R-18作品声优索引}}',
        prop: 'text',
        contentmodel: 'wikitext',
      });
      const html = (res as { parse?: { text?: string } }).parse?.text || '';
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const anchors = doc.querySelectorAll('a.new');
      setLinks(Array.from(anchors).map((a) => ({
        text: a.textContent || '',
        href: a.getAttribute('href') || '',
      })));
    } catch (e) {
      message.error(t('获取模板失败: {{detail}}', { detail: formatError(e) }));
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setPageSize(10);
    fetchLinks();
  };

  const handleClose = () => {
    setSearch('');
    onClose();
  };

  const columns: TableColumnsType<TemplateLink & { key: string }> = useMemo(() => [
    { title: t('声优名'), dataIndex: 'text', key: 'text' },
    {
      title: t('条目名'),
      dataIndex: 'href',
      key: 'href',
      render: (href: string) => {
        const match = href.match(/[?&]title=([^&]*)/);
        const title = match ? decodeURIComponent(match[1]) : href;
        return (
          <MoegirlLink
            title={title}
            params={{ action: 'edit', redlink: '1' }}
            red
          >
            {title}
          </MoegirlLink>
        );
      },
    },
    {
      title: t('操作'),
      key: 'action',
      width: 100,
      align: 'center',
      render: (_, record) => (
        <Button
          type='link'
          size='small'
          icon={<CheckOutlined />}
          onClick={() => {
            onSelect(record.text);
            handleClose();
          }}
        >
          {t('选择')}
        </Button>
      ),
    },
  ], [t, onSelect]);

  return (
    <Modal
      open={open}
      title={<><MoegirlLink title='Template:R-18作品声优索引'>{'{{R-18作品声优索引}}'}</MoegirlLink>{t('中未创建的页面')}</>}
      footer={null}
      onCancel={handleClose}
      afterOpenChange={(visible) => { if (visible) { handleOpen(); } }}
      width={700}
    >
      <div className='max-h-[calc(100vh-200px)] flex flex-col'>
        <Input
          className='shrink-0 mb-3!'
          allowClear
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className='overflow-auto flex-1 min-h-0'>
          <Table
            loading={loading}
            columns={columns}
            dataSource={filteredLinks.map((l, i) => ({ ...l, key: String(i) }))}
            size='small'
            pagination={{
              pageSize,
              showTotal: (total) => t('共 {{total}} 条', { total }),
              onChange: (_page, size) => setPageSize(size),
            }}
          />
        </div>
      </div>
    </Modal>
  );
}
