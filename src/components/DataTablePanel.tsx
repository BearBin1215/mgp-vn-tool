import type { ReactNode } from 'react';
import { Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';

interface TableSection {
  /** 表格标题 */
  title: string;
  // sections 数组含异构类型，组件内部不关心具体类型
  columns: TableColumnsType<any>;
  dataSource: Record<string, any>[];
}

interface DataTablePanelProps {
  /** 面板标题 */
  header?: ReactNode;
  /** 多个表格分段 */
  sections: TableSection[];
}

/** 右侧原始数据面板，统一三页面的 Splitter 右侧面板结构 */
export default function DataTablePanel({ header, sections }: DataTablePanelProps) {
  return (
    <>
      {header !== undefined && (
        <div className='flex items-center justify-between shrink-0 px-1 h-6'>
          {typeof header === 'string' ? <Typography.Text strong>{header}</Typography.Text> : header}
        </div>
      )}
      <div className='overflow-auto flex-1 min-h-0 border border-(--ant-color-border)'>
        {sections.filter((s) => s.dataSource.length > 0).map((section) => (
          <div key={section.title}>
            <Typography.Text strong>{section.title}</Typography.Text>
            <Table
              columns={section.columns}
              dataSource={section.dataSource}
              size='small'
              pagination={false}
            />
          </div>
        ))}
      </div>
    </>
  );
}
