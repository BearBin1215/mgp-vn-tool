import { Typography } from 'antd';
import { openUrl } from '@tauri-apps/plugin-opener';

type ExternalLinkProps = Omit<React.ComponentProps<typeof Typography.Link>, 'href' | 'onClick'> & {
  href: string;
};

/** 外部链接组件：左键点击用系统默认浏览器打开，右键正常显示链接的菜单 */
export default function ExternalLink({ href, children, ...rest }: ExternalLinkProps) {
  return (
    <Typography.Link
      href={href}
      onClick={(e) => {
        e.preventDefault();
        openUrl(href);
      }}
      {...rest}
    >
      {children}
    </Typography.Link>
  );
}
