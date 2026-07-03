import { version } from '../../package.json';

/** 批评空间待定作品发售时间为 2050-01-01 */
export const PENDING_SELL_DATE = '2050-01-01';

/** 飞书统计表应用默认 App ID */
export const DEFAULT_FEISHU_APP_ID = 'cli_a4586356dbfa100c';

/** 默认 UA，与后端 http.rs 的 build_client 保持一致 */
export const DEFAULT_USER_AGENT = `BearBin1215/mgp-vn-tool/${version} (https://github.com/BearBin1215/mgp-vn-tool)`;
