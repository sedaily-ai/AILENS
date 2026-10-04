import React from 'react';
import {
  Smartphone,
  ArrowRight,
  ArrowDown,
  Coins,
  AlertTriangle,
  ShieldAlert,
  PhoneCall,
  CreditCard,
  FileWarning,
  Megaphone,
  Info,
  TrendingDown,
  TrendingUp,
  Landmark,
  Scale,
  Users,
  Building2,
  Croissant,
  MapPin,
  Car,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';
import { COLORS } from '../styles/tokens';

// data.icon / node.icon 문자열 키 → lucide 아이콘 매핑.
// JSON에 새 아이콘 키가 필요하면 이 표에 추가한다. 없는 키는 HelpCircle로 폴백.
const ICON_MAP: Record<string, LucideIcon> = {
  smartphone: Smartphone,
  'arrow-right': ArrowRight,
  'arrow-down': ArrowDown,
  coin: Coins,
  coins: Coins,
  'alert-triangle': AlertTriangle,
  'shield-alert': ShieldAlert,
  'phone-call': PhoneCall,
  'credit-card': CreditCard,
  'file-warning': FileWarning,
  megaphone: Megaphone,
  info: Info,
  'trending-down': TrendingDown,
  'trending-up': TrendingUp,
  landmark: Landmark,
  scale: Scale,
  users: Users,
  building: Building2,
  croissant: Croissant,
  'map-pin': MapPin,
  car: Car,
};

export const Icon: React.FC<{
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}> = ({ name, size = 64, color = COLORS.text, strokeWidth = 1.75 }) => {
  const Component = ICON_MAP[name] ?? HelpCircle;
  return <Component size={size} color={color} strokeWidth={strokeWidth} />;
};
