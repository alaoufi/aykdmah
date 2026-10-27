import { useGeolocation } from '../hooks/useGeolocation';
import Hero from '../components/home/Hero';
import ServicesHighlight from '../components/home/ServicesHighlight';
import Categories from '../components/home/Categories';
import Urgent from '../components/home/Urgent';
import HowItWorks from '../components/home/HowItWorks';
import Latest from '../components/home/Latest';
import StatsStrip from '../components/home/StatsStrip';
import AdSlot from '../components/ads/AdSlot';

export default function HomePage() {
  const { position } = useGeolocation();

  return (
    <main className="pb-24 md:pb-0">
      <div className="container max-w-5xl mx-auto px-4 pt-4">
        <AdSlot placement="home_top" />
      </div>
      <Hero />
      <div className="container max-w-5xl mx-auto px-4">
        <AdSlot placement="home_hero" />
      </div>
      <ServicesHighlight />
      <Categories />
      <div className="container max-w-5xl mx-auto px-4">
        <AdSlot placement="home_middle" />
      </div>
      <Urgent position={position} />
      <HowItWorks />
      <Latest position={position} />
      <StatsStrip />
      <div className="container max-w-5xl mx-auto px-4 mt-4">
        <AdSlot placement="home_bottom" />
      </div>
    </main>
  );
}
