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
import GuestHome from '../components/home/GuestHome';

export default function HomePage() {
  const { position } = useGeolocation();
  const { user } = useAuth();

  // A signed-in requester sees only what they need (AYK-041). So does an account that is both
  // requester and provider (AYK-333): it was given the visitors' page, with neither the request
  // card nor the requests in its own profession and area.
  if (user?.role === 'client' || (user?.role === 'provider' && Number(user.also_client) === 1)) {
    return (
      <div>
        <div className="container max-w-5xl mx-auto px-4 pt-4"><AdSlot placement="home_top" /></div>
        <RequesterHome />
        {/* The other home placements show to signed-in requesters too (AYK-159). */}
        <div className="container max-w-5xl mx-auto px-4 space-y-4">
          <AdSlot placement="home_hero" />
          <AdSlot placement="home_middle" />
          <AdSlot placement="home_bottom" />
        </div>
      </div>
    );
  }

  // AYK-413 (the owner): a visitor sees the professions, their categories, the requests and the
  // providers, nothing else; chatting needs an account.
  if (!user) {
    return (
      <div>
        <div className="container max-w-5xl mx-auto px-4 pt-3"><AdSlot placement="home_top" /></div>
        <GuestHome />
        <div className="container max-w-5xl mx-auto px-4 space-y-4 mb-4">
          <AdSlot placement="home_hero" />
          <AdSlot placement="home_middle" />
          <AdSlot placement="home_bottom" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="container max-w-5xl mx-auto px-4 pt-4">
        <AdSlot placement="home_top" />
      </div>
      <Hero />
      {/* The apps in Google Play and the App Store (AYK-227), on the website only. */}
      {/* Visitors see what each side gains and can look around first (AYK-158). */}
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
    </div>
  );
}
