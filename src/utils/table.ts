/**
 * 为记录追加 antd Table 所需的稳定 key
 *
 * antd Table 默认用 `key` 字段作行 key，无 key 时会有警告。用行索引生成稳定 key，
 * 适用于一次性渲染、不涉及行增删排序的只读数据表。
 * @param records 原始记录数组
 */
export const toTableData = <T>(records: T[]): (T & { key: string })[] =>
  records.map((r, i) => ({ ...r, key: String(i) }));
