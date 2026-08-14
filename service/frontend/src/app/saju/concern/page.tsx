'use client';

import { ConcernCardFlow } from '@saju/widgets/ConcernCardFlow';

export default function ConcernPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-[540px] pt-6 pb-24">
        <ConcernCardFlow startAtCategory />
      </div>
    </div>
  );
}
