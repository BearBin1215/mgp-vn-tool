import { useImperativeHandle, useRef, useState, useEffect } from 'react';
import type { Ref } from 'react';
import { App, AutoComplete, Input } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { isNumeric } from '@/utils/text';

/** 搜索下拉选项 */
export interface SearchInputOption {
  /** 选项唯一键（用于内部区分同名条目，需唯一） */
  value: string;
  /** 下拉项展示内容 */
  label: React.ReactNode;
  /** 选项对应的实体 id */
  id: string;
  /** 选中后填入输入框的显示文本，未提供时回退到 value */
  display?: string;
}

/** 通过 ref 暴露的命令式接口 */
export interface SearchInputHandle {
  /** 设置输入值并立即触发一次搜索（供外部注入，如模板选择） */
  setValueAndSearch: (value: string) => void;
  /** 取消挂起的防抖搜索并清除搜索中状态 */
  cancelPendingSearch: () => void;
}

interface SearchInputProps {
  /** 命令式接口引用（React 19 ref as prop） */
  ref?: Ref<SearchInputHandle>;
  /** 根据关键词异步搜索，返回选项列表 */
  fetchOptions: (keyword: string) => Promise<SearchInputOption[]>;
  /** 输入框占位符 */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义 className */
  className?: string;
  /** 输入值变化（手动输入、选中、程序注入均会触发） */
  onValueChange?: (value: string) => void;
  /** 已选 id 变化：选中某项时为该 id，手动输入或清空时为 null */
  onIdChange?: (id: string | null) => void;
  /** 搜索失败回调，未提供时使用默认的 message 提示 */
  onSearchError?: (e: unknown) => void;
}

/** 带防抖的名称搜索输入框，支持直接输入 id 跳过搜索 */
export default function SearchInput({
  ref,
  fetchOptions,
  placeholder,
  disabled,
  className,
  onValueChange,
  onIdChange,
  onSearchError,
}: SearchInputProps) {
  const { message } = App.useApp();
  const [value, setValue] = useState('');
  const [options, setOptions] = useState<SearchInputOption[]>([]);
  // 搜索中状态：仅影响输入框 suffix 的「搜索中...」提示
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 请求序号：仅采纳最近一次搜索的结果，避免并发搜索的旧响应覆盖新响应
  const reqGenRef = useRef(0);
  // 选中标记：记录刚选中项的唯一键，供 handleChange 识别并保留显示文本而非唯一键
  const selectingRef = useRef<string | null>(null);

  // 组件卸载时清理挂起的防抖定时器，避免卸载后仍触发搜索 setState
  useEffect(() => () => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
  }, []);

  /** 处理搜索失败：优先调用自定义回调，否则使用默认 message 提示 */
  const handleSearchError = (e: unknown) => {
    if (onSearchError) {
      onSearchError(e);
    } else {
      message.error(`搜索失败: ${e instanceof Error ? e.message : e}`);
    }
  };

  /** 发起一次搜索并更新下拉选项（仅当仍是最近一次请求时采纳结果） */
  const doSearch = async (keyword: string) => {
    const gen = ++reqGenRef.current;
    setSearching(true);
    try {
      const results = await fetchOptions(keyword);
      // 并发搜索时丢弃过期响应，避免旧结果覆盖新结果
      if (gen !== reqGenRef.current) {
        return;
      }
      setOptions(results);
    } catch (e) {
      if (gen !== reqGenRef.current) {
        return;
      }
      // 搜索失败时清空下拉，避免残留旧结果与当前输入不匹配
      setOptions([]);
      handleSearchError(e);
    } finally {
      if (gen === reqGenRef.current) {
        setSearching(false);
      }
    }
  };

  useImperativeHandle(ref, () => ({
    setValueAndSearch: (v: string) => {
      setValue(v);
      onValueChange?.(v);
      onIdChange?.(null);
      doSearch(v);
    },
    cancelPendingSearch: () => {
      // 使挂起的搜索结果失效，避免取消后仍写入 options
      reqGenRef.current += 1;
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      setSearching(false);
    },
  }));

  /** 输入框搜索回调（仅在用户输入时触发，选中不触发） */
  const handleSearch = (v: string) => {
    setValue(v);
    onValueChange?.(v);
    onIdChange?.(null);
    setSearching(false);

    // 清除上一次挂起的防抖定时器，避免快速连续输入时触发多次搜索
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }

    // 空输入或纯数字 id 时直接清空选项（纯数字视为直接输入的 id，跳过搜索）
    if (!v.trim() || isNumeric(v)) {
      setOptions([]);
      return;
    }

    // 防抖：用户停止输入 500ms 后发起搜索
    searchTimeoutRef.current = setTimeout(() => {
      doSearch(v);
    }, 500);
  };

  /** 输入值变化（输入与选中都会触发） */
  const handleChange = (v: string) => {
    // 选中后 antd 会以 option.value（唯一键）触发 onChange，此时保留 onSelect 已回填的显示文本
    if (selectingRef.current !== null) {
      selectingRef.current = null;
      return;
    }
    setValue(v);
    onValueChange?.(v);
  };

  /** 选中某项时记录对应 id，并将显示文本回填输入框 */
  const handleSelect = (_v: string, option: SearchInputOption) => {
    const display = option.display ?? option.value;
    // 选中后 onChange 会以 option.value（唯一键）触发，此处先回填显示文本
    setValue(display);
    onValueChange?.(display);
    onIdChange?.(option.id);
    // 标记下一次 onChange 为选中回填，避免被 option.value 覆盖
    selectingRef.current = option.value;
  };

  return (
    <AutoComplete
      className={className}
      options={options}
      showSearch={{ onSearch: handleSearch, filterOption: false }}
      onSelect={handleSelect}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
    >
      <Input
        disabled={disabled}
        suffix={searching ? <LoadingOutlined spin /> : <span />}
      />
    </AutoComplete>
  );
}
