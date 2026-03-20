import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { InteractiveHero } from "./interactive-hero"
import { FeatureShowcase } from "./feature-showcase"
import { StickyFeatureSection } from "./StickyFeatureSection"
import { UseCaseCards } from "./use-case-cards"
import { TrustIndicators } from "./trust-indicators"
import { AnimatedGrid } from "./animated-grid"
import { ScrollRevealSection } from "./ScrollRevealSection"
import { Button, Logo, Footer } from "@realyn/shared"
import { ArrowRightIcon, ChevronDownIcon } from "@radix-ui/react-icons"
import { Bot, UserCheck } from "lucide-react"

interface LandingPageProps {
  onLoginClick: () => void
  onContactSalesClick: () => void
  onNavigateToLegal?: (page: string) => void
}

const FAQItem: React.FC<{ question: string; answer: string; index: number }> = ({ question, answer, index }) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="border border-white/10 rounded-xl bg-white/[0.03] overflow-hidden transition-all hover:border-white/15"
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-5 flex items-center justify-between text-left group"
      >
        <span className="text-lg font-semibold text-slate-50 pr-4 group-hover:text-cyan-400 transition-colors">
          {question}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDownIcon className="w-5 h-5 text-slate-400 flex-shrink-0" />
        </motion.div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-5">
              <p className="text-slate-300 leading-relaxed">
                {answer}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

const NAV_LINKS = [
  { label: "Platform", href: "#features" },
  { label: "Workflow", href: "#how-it-works" },
  { label: "Security", href: "#trust" },
  { label: "FAQ", href: "#faq" },
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
      className="fixed top-0 left-0 right-0 z-50 bg-transparent"
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
          <div className={`hidden md:flex items-center gap-6 transition-all duration-300 text-transparent ${
            scrolled
              ? "bg-slate-950/80 backdrop-blur-xl border border-white/5 rounded-lg px-4 py-2"
              : ""
          }`}>
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-slate-400 hover:text-white transition-colors link-underline"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Button
              onClick={onContactSalesClick}
              size="sm"
              className={`px-5 rounded-full font-semibold transition-all duration-300 ${
                scrolled
                  ? "bg-white text-slate-950 hover:bg-slate-100"
                  : "bg-cyan-400 text-slate-950 hover:bg-cyan-300"
              }`}
            >
              Book a demo
            </Button>
            <Button
              onClick={onLoginClick}
              size="sm"
              variant="ghost"
              className="px-5 text-slate-300 hover:text-white hover:bg-white/5 rounded-full font-medium group"
            >
              Login
              <ArrowRightIcon className="ml-1 w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </Button>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-slate-300 hover:bg-white/10 transition-colors"
            aria-label="Toggle menu"
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
            className="md:hidden overflow-hidden bg-slate-950/95 backdrop-blur-xl border-t border-white/10"
          >
            <div className="container mx-auto px-4 py-4 flex flex-col gap-2">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block py-3 px-4 text-base text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <div className="border-t border-white/10 my-2" />
              <div className="flex flex-col gap-2 px-4 pb-2">
                <Button
                  onClick={() => { onContactSalesClick(); setMobileMenuOpen(false); }}
                  size="sm"
                  className="w-full rounded-full font-semibold bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                >
                  Book a demo
                </Button>
                <Button
                  onClick={() => { onLoginClick(); setMobileMenuOpen(false); }}
                  size="sm"
                  variant="ghost"
                  className="w-full rounded-full font-medium text-slate-300 hover:text-white hover:bg-white/5"
                >
                  Login
                  <ArrowRightIcon className="ml-1 w-3 h-3" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  )
}

function ControlModelSection() {
  const systemHandles = [
    "Dispute intake and categorization",
    "Transaction matching",
    "Evidence assembly and scoring",
    "Response drafting",
    "Deadline and SLA tracking",
  ]
  const teamControls = [
    "Match approval for low-confidence disputes",
    "Response review before submission",
    "Evidence supplementation",
    "Policy and rule configuration",
    "Submission authorization",
  ]

  return (
    <section className="relative py-20 md:py-32 overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6">
        <ScrollRevealSection className="text-center max-w-3xl mx-auto mb-10 md:mb-16">
          <h2 className="text-4xl md:text-6xl font-bold mb-6 font-display">
            AI operates. Your team decides.
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed">
            Built by dispute operations specialists who saw that generic tools miss the evidence nuances, business context, and processor-specific requirements that win disputes.
          </p>
        </ScrollRevealSection>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* System handles */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="p-8 rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.03]"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <Bot className="w-5 h-5 text-cyan-400" />
              </div>
              <h3 className="text-xl font-bold text-white font-display">System handles</h3>
            </div>
            <ul className="space-y-3">
              {systemHandles.map((item) => (
                <li key={item} className="flex items-start gap-3 text-slate-300">
                  <span className="text-cyan-400 mt-1.5 w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Team controls */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="p-8 rounded-2xl border border-white/10 bg-white/[0.03]"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white font-display">Your team controls</h3>
            </div>
            <ul className="space-y-3">
              {teamControls.map((item) => (
                <li key={item} className="flex items-start gap-3 text-slate-300">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-white/40 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLoginClick, onContactSalesClick, onNavigateToLegal }) => {
  const faqs = [
    {
      question: "Which payment processors does Realyn support?",
      answer: "Realyn currently supports Stripe and Adyen with native dispute API integration. We're continuously adding support for more payment processors based on customer needs across industries."
    },
    {
      question: "How long does it take to set up Realyn?",
      answer: "Setup typically takes less than 30 minutes. You'll need to connect your payment processor and business systems, configure webhooks, and complete an initial data sync. Our onboarding team is available to assist with the process."
    },
    {
      question: "Is my data secure?",
      answer: "Realyn uses enterprise-grade security with SOC 2 Type II certification, PCI DSS Level 1 compliance, and ISO 27001 certification. Your payment and customer data is encrypted in transit and at rest, with strict role-based access controls."
    },
    {
      question: "Can I customize the AI-generated responses?",
      answer: "Yes. Realyn generates draft responses based on the dispute reason and available evidence, but your team has full control to review, edit, and approve every response before submission. The AI learns from your specific business policies and documents."
    },
    {
      question: "What happens if a dispute can't be automatically matched?",
      answer: "Disputes that can't be automatically matched are flagged for manual review with a confidence score. You can search and link disputes to transactions manually using our interface. The system learns from your manual matches to improve future automatic matching."
    },
    {
      question: "How much does Realyn cost?",
      answer: "Pricing is based on your dispute volume and business size. Contact our sales team for a customized quote. We offer flexible plans for individual businesses and multi-location portfolios."
    },
    {
      question: "Which business systems can I integrate with?",
      answer: "Realyn integrates with a growing range of business platforms including PMS systems, CRMs, and e-commerce platforms. We automatically sync transaction and customer data, ensuring dispute responses always have the most up-to-date information."
    },
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 overflow-x-hidden">
      <AnimatedGrid />

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

        {/* 6. Control Model */}
        <ControlModelSection />

        <div className="h-16 md:h-24" />

        {/* 7. FAQ */}
        <section id="faq" className="relative py-20 md:py-32 overflow-hidden">
          <div className="container mx-auto px-4 sm:px-6">
            <ScrollRevealSection className="text-center mb-10 md:mb-16">
              <h2 className="text-4xl md:text-6xl font-bold mb-6 font-display">
                Frequently Asked Questions
              </h2>
              <p className="text-slate-400 max-w-2xl mx-auto text-xl">
                Common questions about the Realyn platform
              </p>
            </ScrollRevealSection>

            <div className="max-w-3xl mx-auto space-y-3">
              {faqs.map((faq, index) => (
                <FAQItem key={index} question={faq.question} answer={faq.answer} index={index} />
              ))}
            </div>
          </div>
        </section>

        <div className="h-16 md:h-24" />

        {/* 8. Final CTA */}
        <section className="relative py-20 md:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/5 via-transparent to-transparent" />

          <div className="container mx-auto px-4 sm:px-6 text-center relative z-10">
            <ScrollRevealSection>
              <h2 className="text-4xl md:text-6xl font-bold mb-6 font-display">
                Ready to run dispute ops at scale?
              </h2>
              <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10">
                See how Realyn automates evidence assembly, response drafting, and processor submission.
              </p>
              <motion.div
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  onClick={onContactSalesClick}
                  size="lg"
                  className="h-16 px-12 text-lg font-bold bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-full btn-glow transition-all duration-300"
                >
                  Book a live walkthrough
                  <ArrowRightIcon className="ml-2 w-5 h-5" />
                </Button>
              </motion.div>
            </ScrollRevealSection>
          </div>
        </section>

        {/* 9. Footer */}
        <Footer onNavigateToLegal={onNavigateToLegal} />
      </div>
    </div>
  )
}
