import StoreBadges from '../components/home/StoreBadges';

// aykdmh.com/app on a computer (AYK-351): both stores, one tap each. Phones go straight to theirs.
export default function AppLinksPage() {
  return (
    <section className="max-w-3xl mx-auto px-4 py-10 text-center" data-testid="app-links">
      {/* On Android the Google Play badge opens the Play Store app itself (a tap is needed for that). */}
      <StoreBadges />{/* AYK-457: the badges only. */}
    </section>
  );
}
