import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/landing/site-header';
import { SiteFooter } from '@/components/landing/site-footer';
import { Hero } from '@/components/landing/hero';
import { MethodsSection } from '@/components/landing/methods-section';
import { HowItWorks } from '@/components/landing/how-it-works';
import { PlanSection } from '@/components/landing/plan-section';
import { CtaSection } from '@/components/landing/cta-section';
import { getCurrentUser } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';

export default async function LandingPage() {
  const t = await getTranslations('nav');
  // Without Supabase configured there is no session to read, and the landing
  // page still has to render — a fresh clone must be explorable.
  const user = isSupabaseConfigured() ? await getCurrentUser() : null;

  return (
    <>
      <a href="#noi-dung" className="sr-only-focusable fixed top-3 left-3 z-[60] rounded-md bg-primary px-4 py-2 text-primary-fg">
        {t('skipToContent')}
      </a>

      <SiteHeader signedIn={user !== null} />

      <main id="noi-dung">
        <Hero />
        <MethodsSection />
        <HowItWorks />
        <PlanSection />
        <CtaSection />
      </main>

      <SiteFooter />
    </>
  );
}
