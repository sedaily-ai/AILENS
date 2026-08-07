'use client';

import { useState } from 'react';
import { Header } from "@/widgets/Header";
import Link from 'next/link';
import { SmartSearchOverlay } from '@/components/mbti/SmartSearchOverlay';
import { UserMenu } from '@/features/auth';
import { DnaContent } from '@/features/dna';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';

export default function DnaPage() {
  const [showSearch, setShowSearch] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <Header
        onSearch={() => setShowSearch(true)}
        tabs={buildHeaderTabs()}
      />

      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <main>
        <DnaContent />
      </main>

      <div className="h-24" />
    </div>
  );
}
