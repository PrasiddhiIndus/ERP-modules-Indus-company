export function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function computeRequirement(activePersonnel, perPersonQty) {
  return safeNumber(activePersonnel) * safeNumber(perPersonQty);
}

export function getEntitlementQty(item, siteRule) {
  if (siteRule?.itemOverrides?.[item.id] != null) {
    return safeNumber(siteRule.itemOverrides[item.id]);
  }
  if (!item.annualEntitlementApplicable) return 0;
  return safeNumber(item.defaultAnnualQtyPerPerson);
}

export function buildPlannerRows({ items, sites, siteRules, issuedBySiteItem, siteStockByItem }) {
  return sites.map((site) => {
    const rule = siteRules.find((r) => r.siteId === site.id);
    const rows = items
      .filter((it) => it.annualEntitlementApplicable)
      .map((item) => {
        const perPerson = getEntitlementQty(item, rule);
        const required = computeRequirement(site.activePersonnelCount, perPerson);
        const issued = safeNumber(issuedBySiteItem[`${site.id}:${item.id}`]);
        const stock = safeNumber(siteStockByItem[`${site.storeId}:${item.id}`]);
        const balanceToIssue = Math.max(required - issued, 0);
        const shortfall = Math.max(required - (issued + stock), 0);
        const excess = Math.max((issued + stock) - required, 0);
        const recommendedDispatch = Math.max(balanceToIssue - stock, 0);
        return {
          itemId: item.id,
          itemName: item.itemName,
          perPerson,
          required,
          issued,
          stock,
          balanceToIssue,
          shortfall,
          excess,
          recommendedDispatch,
        };
      });
    return { site, rows };
  });
}

