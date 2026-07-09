import { Button, Result } from 'antd';
import { useNavigate } from 'react-router';

interface EmptyArticleWarningProps {
  /** 提示副标题 */
  subTitle: string;
  /** 点击「继续使用」的回调 */
  onDismiss: () => void;
}

/** 条目统计数据为空时的警告页，提供「继续使用」和「前往获取数据」两个操作 */
export default function EmptyArticleWarning({ subTitle, onDismiss }: EmptyArticleWarningProps) {
  const navigate = useNavigate();

  return (
    <Result
      status='warning'
      title='未获取条目数据'
      subTitle={subTitle}
      extra={[
        <Button
          key='continue'
          type='primary'
          onClick={onDismiss}
        >
          继续使用
        </Button>,
        <Button key='fetch' onClick={() => navigate('/article-stats')}>
          前往获取数据
        </Button>,
      ]}
    />
  );
}
