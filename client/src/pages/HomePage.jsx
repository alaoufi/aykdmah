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

export default function HomePage() {
  const { position } = useGeolocation();
  const { user } = useAuth();

  return (
    <main className="pb-24 md:pb-0">
      <div className="container max-w-5xl mx-auto px-4 pt-4">
        <AdSlot placement="home_top" />
      </div>
      <Hero />
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
