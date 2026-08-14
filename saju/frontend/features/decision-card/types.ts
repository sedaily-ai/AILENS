export type PersonaId = 'wise' | 'bold' | 'calm' | 'kind';

export interface Persona {
  id: PersonaId;
  name: string;
  emoji: string;
  tone: string; // 짧은 설명
}

export type DecisionOption = 'yes' | 'no' | 'maybe' | 'later';

export interface DecisionCard {
  id: string;
  date: string; // ISO date
  decisionText: string;
  chosenOption: DecisionOption;
  personaId: PersonaId;
  resultSummary: string;
  createdAt: number; // timestamp
}

export interface DecisionPromptState {
  decisionText: string;
  chosenOption: DecisionOption | null;
}
