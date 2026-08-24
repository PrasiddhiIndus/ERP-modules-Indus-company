import React from 'react';
import { MERGE_TOKENS } from '../data/outreachConstants';

export default function MergeTokenChips({ onInsert, className = '' }) {
  return (
    <div className={`flex flex-wrap gap-1.5 mt-2 ${className}`.trim()}>
      {MERGE_TOKENS.map((token) => (
        <button
          key={token}
          type="button"
          onClick={() => onInsert(token)}
          className="px-2 py-0.5 rounded border border-border bg-surface-sunken text-[11px] font-mono text-ink-secondary hover:border-accent hover:text-accent transition-colors"
        >
          {token}
        </button>
      ))}
    </div>
  );
}
