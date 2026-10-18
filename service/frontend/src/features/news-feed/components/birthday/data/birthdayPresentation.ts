import { Baby, Building2, CalendarDays, ChartCandlestick, ChartNoAxesCombined, Clock3, Gem, Globe2, HeartPulse, History, House, Landmark, Newspaper, Package, ShoppingBasket, Trophy, Utensils, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const STATE_LABELS = { ready: '비교 가능', partial: '일부 확인', pending: '준비 중', unavailable: '비교 불가' };
export const ITEM_ICONS: Record<string, LucideIcon> = {
  'front-page': Newspaper,
  'market-snapshot': ChartNoAxesCombined,
  cpi: ShoppingBasket,
  'living-prices': Utensils,
  'same-product': Package,
  'minimum-wage': Clock3,
  samsung: ChartCandlestick,
  'market-cap-top10': Trophy,
  'same-age-companies': Building2,
  'gold-ring': Gem,
  'seoul-apartment': House,
  'million-won': Wallet,
  'national-economy': Globe2,
  births: Baby,
  'life-expectancy': HeartPulse,
  'pension-rules': Landmark,
  'pension-calendar': CalendarDays,
  'history-chart': History,
};
