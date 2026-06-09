import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const SECTION_LABELS = {
  masters: "Masters",
  entries: "Entries",
  analysis: "Analysis",
  reports: "Reports",
  portfolio: "Portfolio",
  setup: "Setup",
  data: "Data",
};

export default function FinanceTabNav({ items, activeId, onSelect, className = "" }) {
  const scrollRef = useRef(null);
  const [thumb, setThumb] = useState({ left: 0, width: 100, overflow: false });

  const updateThumb = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollWidth, clientWidth, scrollLeft } = el;
    if (scrollWidth <= clientWidth + 2) {
      setThumb({ left: 0, width: 100, overflow: false });
      return;
    }
    const widthPct = (clientWidth / scrollWidth) * 100;
    const leftPct = (scrollLeft / (scrollWidth - clientWidth)) * (100 - widthPct);
    setThumb({ left: leftPct, width: widthPct, overflow: true });
  }, []);

  useEffect(() => {
    updateThumb();
    const el = scrollRef.current;
    if (!el) return undefined;
    el.addEventListener("scroll", updateThumb, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateThumb) : null;
    ro?.observe(el);
    window.addEventListener("resize", updateThumb);
    return () => {
      el.removeEventListener("scroll", updateThumb);
      ro?.disconnect();
      window.removeEventListener("resize", updateThumb);
    };
  }, [updateThumb, items]);

  const scrollBy = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * 180, behavior: "smooth" });
  };

  const handleClick = (item) => {
    if (item.onClick) item.onClick();
    else onSelect?.(item.id);
  };

  return (
    <div className={`fin-tab-nav ${className}`.trim()}>
      <style>{`
        .fin-tab-nav .fin-tab-scroll::-webkit-scrollbar{display:none;}
        .fin-tab-nav .fin-tab-scroll{-ms-overflow-style:none;scrollbar-width:none;}
        .fin-tab-nav nav{display:flex!important;flex-direction:row!important;flex-wrap:nowrap;align-items:center;gap:0.25rem;min-width:max-content;flex:none;width:auto;}
        .fin-tab-nav nav button{width:auto;text-align:center;border-left:none;}
      `}</style>
      <div ref={scrollRef} className="fin-tab-scroll overflow-x-auto px-4 sm:px-6">
        <nav className="fin-tab-row flex gap-1 min-w-max items-center py-1.5">
          {items.map((item, index) => {
            const showSection = item.section && items[index - 1]?.section !== item.section;
            const Icon = item.icon;
            const isActive = activeId === item.id;
            return (
              <React.Fragment key={item.id}>
                {showSection && (
                  <span className="inline-flex items-center px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 self-center select-none">
                    {SECTION_LABELS[item.section] || item.section}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleClick(item)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap rounded-lg transition-colors ${
                    isActive
                      ? "bg-red-50 text-red-800 font-semibold shadow-sm"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                  {item.label}
                  {item.badge != null && item.badge !== "" && (
                    <span className="rounded-full bg-gray-100 border border-gray-200 px-1.5 text-[10px] font-mono text-gray-500 leading-4">
                      {item.badge}
                    </span>
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </nav>
      </div>
      <div className="relative mx-4 sm:mx-6 mt-0.5 mb-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          className="shrink-0 p-0 border-0 bg-transparent text-red-400 hover:text-red-600 cursor-pointer disabled:opacity-30"
          disabled={!thumb.overflow}
          aria-label="Scroll tabs left"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <div className="relative flex-1 h-[3px] bg-red-100 rounded-full overflow-hidden">
          <div
            className="absolute top-0 h-full bg-red-500 rounded-full transition-[left,width] duration-150 ease-out"
            style={{ left: `${thumb.left}%`, width: `${thumb.width}%` }}
          />
        </div>
        <button
          type="button"
          onClick={() => scrollBy(1)}
          className="shrink-0 p-0 border-0 bg-transparent text-red-400 hover:text-red-600 cursor-pointer disabled:opacity-30"
          disabled={!thumb.overflow}
          aria-label="Scroll tabs right"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
