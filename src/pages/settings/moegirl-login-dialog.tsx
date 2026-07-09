import { useState } from 'react';
import { App, Modal, Form, Input, Alert } from 'antd';
import { useSettingsStore } from '@/stores/settings-store';

interface MoegirlLoginDialogProps {
  open: boolean;
  onClose: () => void;
}

/** 登录萌百弹窗 */
export default function MoegirlLoginDialog({ open, onClose }: MoegirlLoginDialogProps) {
  const loginMoegirl = useSettingsStore((state) => state.loginMoegirl);
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
      message.success('登录成功');
      form.resetFields();
      setUsername('');
      setPassword('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
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
      title='登录萌娘百科'
      open={open}
      onCancel={handleClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      okText={loading ? '登录中...' : '登录'}
      cancelText='取消'
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
          label='用户名'
          name='username'
          rules={[{ required: true, message: '请输入用户名' }]}
        >
          <Input
            placeholder='请输入用户名'
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Form.Item>
        <Form.Item
          label='密码'
          name='password'
          rules={[{ required: true, message: '请输入密码' }]}
        >
          <Input.Password
            placeholder='请输入密码'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { handleSubmit(); } }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
