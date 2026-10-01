export function normalizeGoogleReview(review = {}) {
  const reviewer = review.reviewer || {};
  const reply = review.reviewReply || review.reply || null;
  const ratingMap = { STAR_RATING_UNSPECIFIED: null, ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  const rawRating = review.starRating ?? review.rating;
  const rating = typeof rawRating === "number" ? rawRating : (ratingMap[rawRating] ?? null);
  return {
    google_review_name: review.name || review.reviewName || null,
    reviewer_display_name: reviewer.displayName || review.reviewerDisplayName || null,
    rating,
    review_text: review.comment || review.reviewText || null,
    review_time: review.createTime ? Date.parse(review.createTime) : (review.reviewTime || null),
    reply_status: reply && (reply.comment || reply.text) ? "answered" : "unanswered",
    raw_reference_json: JSON.stringify(review)
  };
}

export function parseGoogleLocationResource(resource = "") {
  const m = String(resource).match(/^accounts\/([^/]+)\/locations\/([^/]+)$/);
  return m ? { accountId: m[1], locationId: m[2] } : null;
}


export async function reviewFingerprint(review = {}){
  const source=[review.google_review_name||"",review.review_time||"",review.reviewer_display_name||"",review.review_text||"",review.rating??""]; const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(source.join("|"))); return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
