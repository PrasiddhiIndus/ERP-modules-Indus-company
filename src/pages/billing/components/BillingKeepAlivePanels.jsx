import React, { useEffect, useState } from 'react';

/**
 * Keeps visited tab panels mounted (hidden) so in-progress form state survives tab switches.
 */
export default function BillingKeepAlivePanels({ tabs, activeId, panelProps = {}, wrapPanel }) {
  const [visited, setVisited] = useState(() => new Set([activeId]));

  useEffect(() => {
    setVisited((prev) => {
      if (prev.has(activeId)) return prev;
      const next = new Set(prev);
      next.add(activeId);
      return next;
    });
  }, [activeId]);

  return (
    <>
      {tabs.map(({ id, component: Component }) => {
        if (!visited.has(id)) return null;
        const isActive = id === activeId;
        const panel = <Component {...panelProps} />;
        return (
          <div key={id} hidden={!isActive} className={isActive ? undefined : 'hidden'} aria-hidden={!isActive}>
            {typeof wrapPanel === 'function' ? wrapPanel(panel, { id, isActive }) : panel}
          </div>
        );
      })}
    </>
  );
}
