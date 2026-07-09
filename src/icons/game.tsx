import Icon from '@ant-design/icons';
import type { AntdIconProps } from '@ant-design/icons/es/components/AntdIcon';
import GameSvg from '@/assets/game.svg?react';

const GameIcon = (props: AntdIconProps) => (
  <Icon component={GameSvg} {...props} />
);

export default GameIcon;
