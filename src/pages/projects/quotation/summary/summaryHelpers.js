/** Pure helpers for Quotation Summary (Main Head → Child Head → Items). */

function newId() {
  return `qs-${Math.random().toString(36).slice(2, 10)}`;
}

/** A, B, … Z, AA, AB, … */
export function indexToLetter(index) {
  let n = Math.max(0, Number(index) || 0);
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export function emptyItem(overrides = {}) {
  return {
    id: overrides.id || newId(),
    srNo: overrides.srNo || '',
    description: overrides.description || '',
    note: overrides.note || '',
    hsnCode: overrides.hsnCode || '',
    unit: overrides.unit || 'Nos',
    qty: overrides.qty ?? 1,
    supplyRate: overrides.supplyRate ?? 0,
    installationRate: overrides.installationRate ?? 0,
    make: overrides.make || '',
    remarks: overrides.remarks || '',
  };
}

export function emptyChildHead(overrides = {}) {
  return {
    id: overrides.id || newId(),
    label: overrides.label || '',
    description: overrides.description || '',
    items: overrides.items || [],
  };
}

export function emptyMainHead(overrides = {}) {
  return {
    id: overrides.id || newId(),
    label: overrides.label || '',
    childHeads: overrides.childHeads || [],
  };
}

export function itemTotals(item) {
  const qty = Number(item?.qty) || 0;
  const supplyRate = Number(item?.supplyRate) || 0;
  const installationRate = Number(item?.installationRate) || 0;
  return {
    supplyTotal: qty * supplyRate,
    installationTotal: qty * installationRate,
  };
}

export function childHeadTotal(childHead) {
  return (childHead?.items || []).reduce(
    (acc, item) => {
      const t = itemTotals(item);
      return {
        supplyTotal: acc.supplyTotal + t.supplyTotal,
        installationTotal: acc.installationTotal + t.installationTotal,
      };
    },
    { supplyTotal: 0, installationTotal: 0 }
  );
}

export function mainHeadTotal(mainHead) {
  return (mainHead?.childHeads || []).reduce(
    (acc, child) => {
      const t = childHeadTotal(child);
      return {
        supplyTotal: acc.supplyTotal + t.supplyTotal,
        installationTotal: acc.installationTotal + t.installationTotal,
      };
    },
    { supplyTotal: 0, installationTotal: 0 }
  );
}

export function grandTotal(mainHeads) {
  return (mainHeads || []).reduce(
    (acc, main) => {
      const t = mainHeadTotal(main);
      return {
        supplyTotal: acc.supplyTotal + t.supplyTotal,
        installationTotal: acc.installationTotal + t.installationTotal,
      };
    },
    { supplyTotal: 0, installationTotal: 0 }
  );
}

/**
 * Derive scope labels for New Quotation / List from the shared BOQ tree.
 * One entry per Main Head with its Child Head labels — never stored separately.
 * @returns {{ mainHeadLabel: string, childHeadLabels: string[] }[]}
 */
export function getScopeLabels(mainHeads) {
  return (mainHeads || []).map((main) => ({
    mainHeadLabel: String(main?.label || '').trim(),
    childHeadLabels: (main?.childHeads || [])
      .map((child) => String(child?.label || '').trim())
      .filter(Boolean),
  }));
}

/** Comma-joined Main Head labels for compact list cells / Subject insert. */
export function formatMainHeadLabels(scopeLabels) {
  return (scopeLabels || [])
    .map((s) => s.mainHeadLabel)
    .filter(Boolean)
    .join(', ');
}

/** Multi-line Main → Child breakdown for tooltips. */
export function formatScopeTooltip(scopeLabels) {
  return (scopeLabels || [])
    .map((s) => {
      const main = s.mainHeadLabel || '(Untitled)';
      if (!s.childHeadLabels?.length) return main;
      return `${main}: ${s.childHeadLabels.join(', ')}`;
    })
    .join('\n');
}

/**
 * Auto-numbering (read-only display): Main 1,2,3… · Child A,B,C… (per main) · Item 1,2,3… (per child).
 * Returns a shallow-enriched clone; does not mutate input.
 */
export function computeNumbering(mainHeads) {
  return (mainHeads || []).map((main, mi) => ({
    ...main,
    displayNo: String(mi + 1),
    childHeads: (main.childHeads || []).map((child, ci) => ({
      ...child,
      displayLetter: indexToLetter(ci),
      items: (child.items || []).map((item, ii) => ({
        ...item,
        srNo: String(ii + 1),
      })),
    })),
  }));
}

export function addMainHead(mainHeads, overrides = {}) {
  return [...(mainHeads || []), emptyMainHead(overrides)];
}

export function addChildHead(mainHeads, mainId, overrides = {}) {
  return (mainHeads || []).map((main) =>
    main.id === mainId
      ? { ...main, childHeads: [...(main.childHeads || []), emptyChildHead(overrides)] }
      : main
  );
}

export function addItem(mainHeads, mainId, childId, overrides = {}) {
  return (mainHeads || []).map((main) => {
    if (main.id !== mainId) return main;
    return {
      ...main,
      childHeads: (main.childHeads || []).map((child) =>
        child.id === childId
          ? { ...child, items: [...(child.items || []), emptyItem(overrides)] }
          : child
      ),
    };
  });
}

/**
 * Remove a node. path: { mainId } | { mainId, childId } | { mainId, childId, itemId }
 */
export function removeNode(mainHeads, path) {
  const { mainId, childId, itemId } = path || {};
  if (!mainId) return mainHeads || [];

  if (!childId) {
    return (mainHeads || []).filter((m) => m.id !== mainId);
  }

  return (mainHeads || []).map((main) => {
    if (main.id !== mainId) return main;
    if (!itemId) {
      return {
        ...main,
        childHeads: (main.childHeads || []).filter((c) => c.id !== childId),
      };
    }
    return {
      ...main,
      childHeads: (main.childHeads || []).map((child) =>
        child.id === childId
          ? { ...child, items: (child.items || []).filter((i) => i.id !== itemId) }
          : child
      ),
    };
  });
}

function swapAt(list, index, direction) {
  const arr = [...(list || [])];
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || index >= arr.length || target >= arr.length) return list || [];
  const tmp = arr[index];
  arr[index] = arr[target];
  arr[target] = tmp;
  return arr;
}

export function moveMainHead(mainHeads, mainId, direction) {
  const list = mainHeads || [];
  const index = list.findIndex((m) => m.id === mainId);
  return swapAt(list, index, direction);
}

export function moveChildHead(mainHeads, mainId, childId, direction) {
  return (mainHeads || []).map((main) => {
    if (main.id !== mainId) return main;
    const index = (main.childHeads || []).findIndex((c) => c.id === childId);
    return { ...main, childHeads: swapAt(main.childHeads, index, direction) };
  });
}

export function moveItem(mainHeads, mainId, childId, itemId, direction) {
  return (mainHeads || []).map((main) => {
    if (main.id !== mainId) return main;
    return {
      ...main,
      childHeads: (main.childHeads || []).map((child) => {
        if (child.id !== childId) return child;
        const index = (child.items || []).findIndex((i) => i.id === itemId);
        return { ...child, items: swapAt(child.items, index, direction) };
      }),
    };
  });
}

export function updateMainHead(mainHeads, mainId, patch) {
  return (mainHeads || []).map((main) => (main.id === mainId ? { ...main, ...patch } : main));
}

export function updateChildHead(mainHeads, mainId, childId, patch) {
  return (mainHeads || []).map((main) => {
    if (main.id !== mainId) return main;
    return {
      ...main,
      childHeads: (main.childHeads || []).map((child) =>
        child.id === childId ? { ...child, ...patch } : child
      ),
    };
  });
}

export function updateItem(mainHeads, mainId, childId, itemId, patch) {
  return (mainHeads || []).map((main) => {
    if (main.id !== mainId) return main;
    return {
      ...main,
      childHeads: (main.childHeads || []).map((child) => {
        if (child.id !== childId) return child;
        return {
          ...child,
          items: (child.items || []).map((item) =>
            item.id === itemId ? { ...item, ...patch } : item
          ),
        };
      }),
    };
  });
}
