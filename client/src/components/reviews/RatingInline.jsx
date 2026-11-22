import StarRating from './StarRating';

// AYK-430 (the owner: «التقييم يظهر معدل عدد النجمات»): wherever a rating shows, its average is drawn
// as five stars (4.5 fills four and a half), then the number and how many ratings. No ratings: nothing.
export default function RatingInline({ average = 0, count = 0, size = 14, className = '', showCount = true }) {
  const n = Number(count) || 0;
  const avg = n ? Number(average) || 0 : 0;
  // AYK-433: no ratings, nothing shown.
  if (!n) return null;
  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className}`} data-testid="rating-inline">
      <StarRating value={avg} readOnly size={size} />
      <span className="font-bold text-amber-700 dark:text-amber-400">{avg.toFixed(1)}{showCount ? <span className="font-normal text-fg-muted"> ({n})</span> : null}</span>
    </span>
  );
}
