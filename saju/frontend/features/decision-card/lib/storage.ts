import type { DecisionCard } from '../types';

const STORAGE_KEY = 'saju_decision_cards';

export function getCards(): DecisionCard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCard(card: DecisionCard): void {
  const cards = getCards();
  cards.unshift(card); // 최신부터
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

export function deleteCard(id: string): void {
  const cards = getCards().filter(c => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

export function generateId(): string {
  return `card_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
