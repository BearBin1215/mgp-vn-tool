import { useState, useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router';

/** 路由配置 */
interface KeepAliveRoute {
  /** 路由路径 */
  path: string;
  /** 页面组件 */
  element: ReactNode;
  /** 是否缓存页面状态 */
  keepAlive?: boolean;
}

/** KeepAlive 组件参数 */
interface KeepAliveProps {
  /** 路由配置列表 */
  routes: KeepAliveRoute[];
}

/** KeepAlive 组件：首次访问后挂载并缓存，不再卸载 */
export default function KeepAlive({ routes }: KeepAliveProps) {
  const location = useLocation();
  const [visited, setVisited] = useState<Set<string>>(() => new Set());

  const aliveRoutes = routes.filter((r) => r.keepAlive);
  const normalRoutes = routes.filter((r) => !r.keepAlive);
  const normalRoute = normalRoutes.find((r) => location.pathname === r.path);

  useEffect(() => {
    if (!visited.has(location.pathname) && aliveRoutes.some((r) => location.pathname === r.path)) {
      // eslint-disable-next-line @eslint-react/set-state-in-effect
      setVisited(new Set(visited).add(location.pathname));
    }
  }, [location.pathname]);

  return (
    <>
      {aliveRoutes.map((route) => visited.has(route.path) && (
        <div
          key={route.path}
          className='h-full flex flex-col'
          hidden={location.pathname !== route.path}
        >
          {route.element}
        </div>
      ))}
      {normalRoute && normalRoute.element}
    </>
  );
}
