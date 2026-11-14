import { useGeolocation } from '../hooks/useGeolocation';
import { useAuth } from '../hooks/useAuth';
import Hero from '../components/home/Hero';
import ForYou from '../components/home/ForYou';
import ServicesHighlight from '../components/home/ServicesHighlight';
import Categories from '../components/home/Categories';
import Urgent from '../components/home/Urgent';
import HowItWorks from '../components/home/HowItWorks';
import Latest from '../components/home/Latest';
import StatsStrip from '../components/home/StatsStrip';
import AdSlot from '../components/ads/AdSlot';
import RequesterHome from '../components/home/RequesterHome';
import GuestShowcase from '../components/home/GuestShowcase';
import StoreBadges from '../components/home/StoreBadges';

export default function HomePage() {
  const { position } = useGeolocation();
  const { user } = useAuth();

  // A signed-in requester sees only what they need (AYK-041).
  if (user?.role === 'client') {
    return (
      <main className="pb-24 md:pb-0">
        <div className="container max-w-5xl mx-auto px-4 pt-4"><AdSlot placement="home_top" /></div>
        <RequesterHome />
        <StoreBadges className="mt-4" />
        {/* The other home placements show to signed-in requesters too (AYK-159). */}
        <div className="container max-w-5xl mx-auto px-4 space-y-4">
          <AdSlot placement="home_hero" />
          <AdSlot placement="home_middle" />
          <AdSlot placement="home_bottom" />
        </div>
      </main>
    );
  }

  return (
    <main className="pb-24 md:pb-0">
      <div className="container max-w-5xl mx-auto px-4 pt-4">
        <AdSlot placement="home_top" />
      </div>
      <Hero />
      {/* The apps in Google Play and the App Store (AYK-227), on the website only. */}
      <StoreBadges className="mt-4" />
      {/* Visitors see what each side gains and can look around first (AYK-158). */}
      {!user && <GuestShowcase />}
      {/* Signed in: what matters is what is in your own area and profession (AYK-035). */}
      <ForYou />
      <div className="container max-w-5xl mx-auto px-4">
        <AdSlot placement="home_hero" />
      </div>
      <ServicesHighlight />
      <Categories />
      <div className="container max-w-5xl mx-auto px-4">
        <AdSlot placement="home_middle" />
      </div>
      {!user && <Urgent position={position} />}
      <HowItWorks />
      {!user && <Latest position={position} />}
      <StatsStrip />
      <div className="container max-w-5xl mx-auto px-4 mt-4">
        <AdSlot placement="home_bottom" />
      </div>
    </main>
  );
}
