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


export function calculateProfileAuditSignals(profile = {}) {
  const checks = [];
  const check = (code, label, present, severity = "medium") => {
    checks.push({ code, label, present: !!present, severity });
  };
  check("profile_name", "Business name verified", profile.name);
  check("profile_category", "Primary category verified", profile.category);
  const addressPresent = profile.address && typeof profile.address === "object"
    ? Object.values(profile.address).some(v => typeof v === "string" ? v.trim().length > 0 : Number.isFinite(v))
    : typeof profile.address === "string" && profile.address.trim().length > 0;
  check("profile_address", "Address/location verified", addressPresent);
  check("profile_phone", "Phone verified", profile.phone);
  check("profile_website", "Website verified", profile.website);
  const completed = checks.filter(x => x.present).length;
  const score = checks.length ? Math.round((completed / checks.length) * 100) : null;
  return { score, checks, state: score === null ? "awaiting_verified_data" : "verified_data" };
}


export function buildAuditActions(signals = {}) {
  const actions = [];
  for (const item of signals.checks || []) {
    if (item.present) continue;
    actions.push({
      code: item.code,
      priority: item.severity === "critical" ? "high" : item.severity,
      title: item.label + " needs attention",
      instructions: "Complete or verify this Google Business Profile signal, then refresh the audit."
    });
  }
  return actions;
}
