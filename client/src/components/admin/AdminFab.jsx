// Floating Action Button for admin list pages.
// Renders only on mobile (CSS .fab hides on >=768px), so the existing
// in-header "+ جديد" button keeps serving desktop users while mobile
// users get a thumb-reachable plus.
export default function AdminFab({ onClick, label = '+', ariaLabel }) {
  return (
    <button className="fab" onClick={onClick} aria-label={ariaLabel || label} type="button">
      {label}
    </button>
  );
}
