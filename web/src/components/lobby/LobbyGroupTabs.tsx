import { LOBBY_GROUPS, type LobbyGroupKey } from '@aps/shared';
import { Tabs } from '../ui/Tabs';

interface LobbyGroupTabsProps {
  counts: Record<LobbyGroupKey, number>;
  value: LobbyGroupKey;
  onChange: (key: LobbyGroupKey) => void;
}

export function LobbyGroupTabs({
  counts,
  value,
  onChange
}: LobbyGroupTabsProps) {
  const items = LOBBY_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    count: counts[group.key]
  }));

  return (
    <Tabs
      ariaLabel="讨论状态分组"
      items={items}
      activeKey={value}
      onChange={(key) => onChange(key as LobbyGroupKey)}
      className="lobby-tabs"
    />
  );
}
