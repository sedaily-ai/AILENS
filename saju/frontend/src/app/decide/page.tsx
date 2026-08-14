'use client';

import { useState, useEffect } from 'react';
import { useLang } from '@saju/shared/lib/LangContext';
import {
  DecisionPrompt,
  PersonaPicker,
  DecisionCardResult,
  DecisionCardList,
  generateCardContent,
  saveCard,
  deleteCard,
  generateId,
  getCards,
  readSajuIlganOh,
  decisionLlmEnabled,
  callDecisionLlm,
} from '@saju/features/decision-card';
import type { DecisionCard, DecisionOption, PersonaId } from '@saju/features/decision-card';

type FlowStep = 'prompt' | 'persona' | 'result' | 'list';

interface PromptState {
  text: string;
  option: DecisionOption;
}

export default function DecidePage() {
  const { lang } = useLang();
  const [step, setStep] = useState<FlowStep>('list');
  const [cards, setCards] = useState<DecisionCard[]>([]);
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<PersonaId | null>(null);
  const [currentCard, setCurrentCard] = useState<DecisionCard | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setCards(getCards());
  }, []);

  const handlePromptConfirm = (text: string, option: DecisionOption) => {
    setPromptState({ text, option });
    setLoading(true);
    setTimeout(() => {
      setStep('persona');
      setLoading(false);
    }, 300);
  };

  const handlePersonaSelect = async (personaId: PersonaId) => {
    setSelectedPersona(personaId);
    setLoading(true);
    if (!promptState) {
      setLoading(false);
      return;
    }
    const { text, option } = promptState;
    const ilganOh = readSajuIlganOh();

    let content: string | null = null;
    if (decisionLlmEnabled()) {
      content = await callDecisionLlm({
        lang, decisionText: text, chosenOption: option, personaId, saju: { ilganOh },
      });
    }
    if (!content) {
      content = generateCardContent(text, option, personaId, ilganOh);
    }

    const card: DecisionCard = {
      id: generateId(),
      date: new Date().toISOString().split('T')[0],
      decisionText: text,
      chosenOption: option,
      personaId,
      resultSummary: content,
      createdAt: Date.now(),
    };
    setCurrentCard(card);
    setStep('result');
    setLoading(false);
  };

  const handleSaveCard = () => {
    if (currentCard) {
      saveCard(currentCard);
      setCards(prev => [currentCard, ...prev]);
      resetFlow();
    }
  };

  const handleBack = () => {
    resetFlow();
  };

  const handleDelete = (id: string) => {
    deleteCard(id);
    setCards(prev => prev.filter(c => c.id !== id));
  };

  const resetFlow = () => {
    setStep('list');
    setPromptState(null);
    setSelectedPersona(null);
    setCurrentCard(null);
  };

  return (
    <div className="min-h-screen bg-white py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {step === 'prompt' && (
          <DecisionPrompt onConfirm={handlePromptConfirm} loading={loading} />
        )}

        {step === 'persona' && (
          <PersonaPicker onSelect={handlePersonaSelect} selected={selectedPersona || undefined} />
        )}

        {step === 'result' && currentCard && (
          <DecisionCardResult card={currentCard} onSave={handleSaveCard} onBack={handleBack} />
        )}

        {step === 'list' && (
          <div className="space-y-8">
            <div>
              <button
                onClick={() => setStep('prompt')}
                className="w-full max-w-md mx-auto block py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
              >
                + 새로운 결정 카드 뽑기
              </button>
            </div>
            <DecisionCardList cards={cards} onDelete={handleDelete} />
          </div>
        )}
      </div>
    </div>
  );
}
