import { useState, useMemo } from 'react';
import { App, Button, Input, Table, Modal, type TableColumnsType } from 'antd';
import { CheckOutlined, SearchOutlined } from '@ant-design/icons';
import moegirl from '@/api/moegirl';
import MoegirlLink from '@/components/MoegirlLink';

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
      message.error(`获取模板失败: ${e instanceof Error ? e.message : e}`);
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
    { title: '声优名', dataIndex: 'text', key: 'text' },
    {
      title: '条目名',
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
      title: '操作',
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
          选择
        </Button>
      ),
    },
  ], [onSelect]);

  return (
    <Modal
      open={open}
      title={<><MoegirlLink title='Template:R-18作品声优索引'>{'{{R-18作品声优索引}}'}</MoegirlLink>中未创建的页面</>}
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
              showTotal: (total) => `共 ${total} 条`,
              onChange: (_page, size) => setPageSize(size),
            }}
          />
        </div>
      </div>
    </Modal>
  );
}
