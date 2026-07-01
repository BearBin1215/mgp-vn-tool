import Icon from '@ant-design/icons';
import GameSvg from '@/assets/game.svg?react';
import { AntdIconProps } from '@ant-design/icons/es/components/AntdIcon';

const GameIcon = (props: AntdIconProps) => (
  <Icon component={GameSvg} {...props} />
);

export default GameIcon;
