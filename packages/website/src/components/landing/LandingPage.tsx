import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { InteractiveHero } from "./interactive-hero"
import { FeatureShowcase } from "./feature-showcase"
import { StickyFeatureSection } from "./StickyFeatureSection"
import { UseCaseCards } from "./use-case-cards"
import { TrustIndicators } from "./trust-indicators"
import { EditorialSectionHeader } from "./EditorialSectionHeader"
import { Button, Logo, Footer } from "@realyn/shared"

interface LandingPageProps {
  onLoginClick: () => void
  onContactSalesClick: () => void
  onNavigateToLegal?: (page: string) => void
}

const NAV_LINKS = [
  { label: "Platform", href: "#features" },
  { label: "Workflow", href: "#how-it-works" },
  { label: "Security", href: "#trust" },
]

function Navigation({ onLoginClick, onContactSalesClick }: { onLoginClick: () => void; onContactSalesClick: () => void }) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <motion.nav
      className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-sm"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="container mx-auto px-4 sm:px-6 flex items-center justify-between transition-all duration-300 h-20">
        <div className="flex items-center gap-2">
          <a
            href="#home"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="cursor-pointer transition-all duration-300 hover:scale-105"
          >
            <Logo className="h-16 sm:h-20" />
          </a>
        </div>

        <div className="flex items-center gap-4 md:gap-8">
          <div className={`hidden md:flex items-center gap-6 transition-all duration-300 ${
            scrolled
              ? "bg-black/95 border-b border-white/10 px-4 py-2"
              : ""
          }`}>
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="font-mono text-xs uppercase tracking-widest text-slate-400 hover:text-white transition-colors link-underline"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Button
              onClick={onContactSalesClick}
              size="sm"
              className={`rounded-none font-mono text-xs uppercase tracking-[0.2em] min-h-[40px] leading-none px-6 py-3 transition-colors ${
                scrolled
                  ? "bg-white text-black hover:bg-slate-100"
                  : "bg-white text-black hover:bg-cyan-400"
              }`}
            >
              Book a demo
            </Button>
            <Button
              onClick={onLoginClick}
              size="sm"
              variant="ghost"
              className="rounded-none font-mono text-xs uppercase tracking-widest min-h-[40px] leading-none text-slate-400 hover:text-white border border-white/20 hover:border-white/40 px-5 py-3 transition-colors"
            >
              Login
            </Button>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-none text-slate-300 hover:bg-white/10 transition-colors"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="md:hidden overflow-hidden bg-black/95 border-t border-white/10"
          >
            <div className="container mx-auto px-4 py-4 flex flex-col gap-2">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block py-3 px-4 font-mono text-xs uppercase tracking-widest text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <div className="border-t border-white/10 my-2" />
              <div className="flex flex-col gap-2 px-4 pb-2">
                <Button
                  onClick={() => { onContactSalesClick(); setMobileMenuOpen(false); }}
                  size="sm"
                  className="w-full rounded-none font-mono text-xs uppercase tracking-[0.2em] min-h-[40px] leading-none py-3 bg-white text-black hover:bg-cyan-400"
                >
                  Book a demo
                </Button>
                <Button
                  onClick={() => { onLoginClick(); setMobileMenuOpen(false); }}
                  size="sm"
                  variant="ghost"
                  className="w-full rounded-none font-mono text-xs uppercase tracking-widest min-h-[40px] leading-none text-slate-400 hover:text-white border border-white/20"
                >
                  Login
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  )
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLoginClick, onContactSalesClick, onNavigateToLegal }) => {
  return (
    <div className="min-h-screen bg-black text-slate-50 overflow-x-hidden">
      <Navigation onLoginClick={onLoginClick} onContactSalesClick={onContactSalesClick} />

      <div className="relative" id="home">
        {/* 1. Hero */}
        <InteractiveHero onButtonClick={onContactSalesClick} buttonText="Book a live walkthrough" />

        <div className="h-16 md:h-24" />

        {/* 2. Platform Workflow */}
        <section id="features" className="relative py-16 md:py-24 overflow-hidden">
          <FeatureShowcase />
        </section>

        <div className="h-16 md:h-24" />

        {/* 3. Sticky Feature Deep-Dive */}
        <section id="how-it-works">
          <StickyFeatureSection />
        </section>

        {/* 4. Segment Outcomes */}
        <section className="pt-4 pb-16 md:pt-8 md:pb-24">
          <UseCaseCards />
        </section>

        <div className="h-16 md:h-24" />

        {/* 5. Operational Trust */}
        <section className="py-16 md:py-24">
          <TrustIndicators />
        </section>

        <div className="h-16 md:h-24" />

        {/* Final CTA */}
        <section className="relative py-20 md:py-32 overflow-hidden border-t border-white/10">
          <div className="container mx-auto px-4 sm:px-6">
            <EditorialSectionHeader
              number="07"
              label="GET STARTED"
              title="Ready to run dispute ops at scale?"
              subtitle="See how Realyn automates evidence assembly, response drafting, and processor submission."
            />
            <div className="max-w-2xl mx-auto text-center">
              <Button
                onClick={onContactSalesClick}
                size="lg"
                className="rounded-none font-mono text-xs uppercase tracking-[0.2em] px-8 py-4 bg-white text-black hover:bg-cyan-400 transition-colors"
              >
                Book a live walkthrough
              </Button>
            </div>
          </div>
        </section>

        {/* 9. Footer */}
        <Footer onNavigateToLegal={onNavigateToLegal} />
      </div>
    </div>
  )
}
