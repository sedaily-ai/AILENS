import type { AnnualComparison } from '../data/birthdayTypes';

export function selectShareComparisons(items: AnnualComparison[]) {
  const valid = items.filter(item => Number.isFinite(item.change));
  return {
    rising: valid.filter(item => item.change > 0).sort((a, b) => b.change - a.change || a.id.localeCompare(b.id)).slice(0, 3),
    falling: valid.filter(item => item.change < 0).sort((a, b) => a.change - b.change || a.id.localeCompare(b.id)).slice(0, 3),
    unchanged: valid.filter(item => item.change === 0).length,
  };
}
