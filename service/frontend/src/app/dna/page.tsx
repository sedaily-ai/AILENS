'use client';

import { useState } from 'react';
import { Header } from "@/widgets/Header";
import Link from 'next/link';
import { SmartSearchOverlay } from '@/components/mbti/SmartSearchOverlay';
import { UserMenu } from '@/features/auth';
import { DnaContent } from '@/features/dna/components/DnaContent';
import { useMbtiGroup } from '@/shared/hooks/useMbtiGroup';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';

export default function DnaPage() {
  const [showSearch, setShowSearch] = useState(false);
  const [selectedGroupForSearch] = useMbtiGroup('SF');

  return (
    <div className="min-h-screen bg-white">
      <Header
        onSearch={() => setShowSearch(true)}
        tabs={buildHeaderTabs()}
      />

      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} selectedGroup={selectedGroupForSearch} />

      <main>
        <DnaContent />
      </main>

      <div className="h-24" />
    </div>
  );
}
