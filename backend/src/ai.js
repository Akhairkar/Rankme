// AI provider boundary for LocalBoost.
// External model calls remain disabled until a provider, credentials, privacy policy,
// cost limits, and production configuration are explicitly established.
// The deterministic fallback below is based only on verified business signals.
export function buildAiContext(data = {}) {
  return {
    business: data.business ? {
      name: data.business.name,
      category: data.business.category,
      city: data.business.city
    } : null,
    verifiedIssues: (data.issues || []).filter(x => x.status !== "resolved").map(x => ({
      code: x.code,
      severity: x.severity,
      title: x.title,
      explanation: x.explanation,
      recommended_fix: x.recommended_fix
    })),
    verifiedReviewSummary: data.reviews ? {
      count: data.reviews.count ?? null,
      average_rating: data.reviews.average_rating ?? null,
      unanswered: data.reviews.unanswered ?? null
    } : null,
    trackedKeywordCount: Array.isArray(data.keywords) ? data.keywords.length : 0
  };
}

export function generateSafeRecommendations(data = {}) {
  const context = buildAiContext(data);
  const items = [];
  for (const issue of context.verifiedIssues) {
    items.push({
      code: "ai:"+issue.code,
      priority: issue.severity || "medium",
      title: issue.title,
      recommendation: issue.recommended_fix || issue.explanation || "Review and update the verified Google Business Profile signal.",
      evidence: "Verified profile audit",
      mode: "deterministic_fallback"
    });
  }
  if (context.verifiedReviewSummary?.unanswered > 0) {
    items.push({
      code: "ai:unanswered_reviews",
      priority: "medium",
      title: "Respond to unanswered reviews",
      recommendation: "Review and respond to unanswered customer reviews in Google Business Profile.",
      evidence: "Verified review data",
      mode: "deterministic_fallback"
    });
  }
  return items;
}
