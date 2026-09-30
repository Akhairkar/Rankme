// Deterministic LocalBoost visibility scoring from verified signals only.
// Missing signals remain unscored; no synthetic/default customer metrics are introduced.
export function calculateVisibilityScore(signals = {}) {
  const parts = [];
  const add = (name, value) => {
    if (Number.isFinite(value)) parts.push({ name, value: Math.max(0, Math.min(100, value)) });
  };
  add("Google Business Profile", signals.profile);
  add("Local rankings", signals.rankings);
  add("Review health", signals.reviews);
  add("Search performance", signals.search);
  if (!parts.length) return { score: null, components: [], state: "awaiting_verified_data" };
  const score = Math.round(parts.reduce((sum, p) => sum + p.value, 0) / parts.length);
  return { score, components: parts, state: "verified_data" };
}
