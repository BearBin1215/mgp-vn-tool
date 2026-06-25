/**
 * 用户组名称映射
 *
 * 虽然应该可以从api获取界面消息，但感觉直接写死比多写一个调用api方便
 *
 * @see https://mzh.moegirl.org.cn/Special:%E7%BE%A4%E7%BB%84%E6%9D%83%E9%99%90
 */
export const groupLabels: Record<string, string> = {
  autoconfirmed: '自动确认用户',
  bot: '机器人',
  bureaucrat: '行政员',
  checkuser: '用户查核员',
  extendedconfirmed: '延伸确认用户',
  'file-maintainer': '文件维护员',
  flood: '机器用户',
  goodeditor: '优质编辑者',
  honoredmaintainer: '荣誉维护人员',
  'interface-admin': '界面管理员',
  'ipblock-exempt': 'IP封禁豁免者',
  patroller: '维护姬',
  'push-subscription-manager': '推送订阅管理员',
  'special-contributor': '特殊贡献者',
  staff: 'STAFF',
  suppress: '监督员',
  sysop: '管理员',
  techeditor: '技术编辑员',
  user: '用户',
};
