import { useState } from 'react';
import { App, Modal, Form, Input, Alert } from 'antd';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/stores/settings-store';
import { formatError } from '@/utils/error';

interface MoegirlLoginDialogProps {
  open: boolean;
  onClose: () => void;
}

/** 登录萌百弹窗 */
export default function MoegirlLoginDialog({ open, onClose }: MoegirlLoginDialogProps) {
  const loginMoegirl = useSettingsStore((state) => state.loginMoegirl);
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();

  const handleSubmit = async () => {
    setError('');
    setLoading(true);

    try {
      await loginMoegirl(username, password);
      message.success(t('登录成功'));
      form.resetFields();
      setUsername('');
      setPassword('');
      onClose();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    form.resetFields();
    setUsername('');
    setPassword('');
    setError('');
    onClose();
  };

  return (
    <Modal
      title={t('登录萌娘百科')}
      open={open}
      onCancel={handleClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      okText={loading ? t('登录中...') : t('登录')}
      cancelText={t('取消')}
    >
      {error && (
        <Alert
          type='error'
          title={error}
          className='mb-4!'
        />
      )}
      <Form
        form={form}
        layout='vertical'
        onFinish={handleSubmit}
      >
        <Form.Item
          label={t('用户名')}
          name='username'
          rules={[{ required: true, message: t('请输入用户名') }]}
        >
          <Input
            placeholder={t('请输入用户名')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Form.Item>
        <Form.Item
          label={t('密码')}
          name='password'
          rules={[{ required: true, message: t('请输入密码') }]}
        >
          <Input.Password
            placeholder={t('请输入密码')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { handleSubmit(); } }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
