import { type FormInstance, Button, Col, DatePicker, Form, Input, Row, Select, Tooltip } from 'antd';
import { UndoOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';

const { RangePicker } = DatePicker;

/** 条件筛选表单值 */
export interface FilterValues {
  /** 作品名称（原名或条目名模糊匹配） */
  name: string;
  /** 制作组织 */
  brands: string[];
  /** 发行时间范围 */
  releaseDateRange: [Dayjs | null, Dayjs | null] | null;
  /** 创建时间范围 */
  creationDateRange: [Dayjs | null, Dayjs | null] | null;
}

/** 条件筛选表单初始值 */
export const filterInitialValues: FilterValues = {
  name: '',
  brands: [],
  releaseDateRange: null,
  creationDateRange: null,
};

/** 条件筛选面板参数 */
interface FilterPanelProps {
  /** antd Form 实例，父组件重置时调用 form.resetFields() */
  form: FormInstance<FilterValues>;
  /** 可选制作组织列表 */
  allBrands: string[];
  /** 表单值变化回调 */
  onValuesChange: (values: FilterValues) => void;
  /** 点击重置回调 */
  onReset: () => void;
}

/** 条件筛选面板：作品名、制作组织与时间范围 */
export default function FilterPanel({ form, allBrands, onValuesChange, onReset }: FilterPanelProps) {
  const { t } = useTranslation();

  return (
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
          initialValues={filterInitialValues}
          onValuesChange={(_, values) => onValuesChange(values)}
          layout='horizontal'
          className='flex-1'
        >
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item name='name' label={t('作品名称')}>
                <Input placeholder={t('搜索原名或条目名')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name='brands' label={t('制作组织')}>
                <Select
                  mode='multiple'
                  placeholder={t('搜索或选择')}
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
                label={t('发行时间')}
                className='mb-2!'
              >
                <RangePicker className='w-full' />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name='creationDateRange'
                label={t('创建时间')}
                className='mb-2!'
              >
                <RangePicker className='w-full' />
              </Form.Item>
            </Col>
          </Row>
        </Form>
        <Tooltip title={t('重置')}>
          <Button
            variant='outlined'
            icon={<UndoOutlined />}
            onClick={onReset}
          />
        </Tooltip>
      </div>
    </div>
  );
}
