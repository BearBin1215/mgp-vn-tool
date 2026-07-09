import { Typography } from 'antd';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useSettingsStore } from '@/stores/settings-store';

interface MoegirlLinkProps {
  /** 页面标题（必填） */
  title: string;
  /** 额外的查询参数，如 { redirect: 'no' } */
  params?: Record<string, string>;
  /** 显示内容，不传则显示 title */
  children?: React.ReactNode;
  /** 是否显示为红色链接（如未创建页面） */
  red?: boolean;
  /** 自定义 className */
  className?: string;
}

/**
 * 萌百链接组件
 * - 只传 title 时跳转 /{title}
 * - 有额外 params 时跳转 /index.php?title={title}&{params}
 */
export default function MoegirlLink({ title, params, children, red, className }: MoegirlLinkProps) {
  const jumpHost = useSettingsStore((s) => s.moegirlJumpHost);
  const apiHost = useSettingsStore((s) => s.moegirlApiHost);
  const host = jumpHost === 'same' ? apiHost : jumpHost;
  const base = `https://${host}`;

  const url = params
    ? `${base}/index.php?${new URLSearchParams({ title, ...params }).toString()}`
    : `${base}/${title}`;

  return (
    <Typography.Link
      href={url}
      onClick={(e) => {
        e.preventDefault();
        openUrl(url);
      }}
      className={className ?? 'text-[length:inherit]!'}
      style={red ? { color: '#d73333' } : undefined}
    >
      {children ?? title}
    </Typography.Link>
  );
}
