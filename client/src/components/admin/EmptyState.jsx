export default function EmptyState({ icon = '📭', title, subtitle, action }) {
  return (
    <div className="text-center py-16 px-6">
      <div className="text-6xl mb-3 opacity-70">{icon}</div>
      <div className="text-ink text-lg font-bold mb-1">{title}</div>
      {subtitle && <p className="text-slate-500 text-sm mb-4">{subtitle}</p>}
      {action}
    </div>
  );
}
