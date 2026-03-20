import React from "react"
import { Logo } from "./Logo"

interface FooterProps {
  onNavigateToLegal?: (page: string) => void
}

export const Footer: React.FC<FooterProps> = ({ onNavigateToLegal }) => {
  const currentYear = new Date().getFullYear()

  const handleLegalClick = (page: string, e: React.MouseEvent) => {
    e.preventDefault()
    if (onNavigateToLegal) {
      onNavigateToLegal(page)
    }
  }

  return (
    <footer className="relative border-t border-white/10 bg-slate-950/50 backdrop-blur-sm">
      <div className="container mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand Column */}
          <div className="col-span-1">
            <Logo className="h-12 w-auto mb-4" />
            <p className="text-slate-400 text-sm leading-relaxed">
              Dispute operations platform for evidence-driven chargeback defense.
            </p>
          </div>

          {/* Product Column */}
          <div>
            <h3 className="text-slate-50 font-semibold mb-4">Product</h3>
            <ul className="space-y-2">
              <li>
                <a href="#features" className="text-slate-400 hover:text-cyan-400 transition-colors text-sm">
                  Platform
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="text-slate-400 hover:text-cyan-400 transition-colors text-sm">
                  Workflow
                </a>
              </li>
              <li>
                <a href="#trust" className="text-slate-400 hover:text-cyan-400 transition-colors text-sm">
                  Security
                </a>
              </li>
              <li>
                <a href="#faq" className="text-slate-400 hover:text-cyan-400 transition-colors text-sm">
                  FAQ
                </a>
              </li>
            </ul>
          </div>

          {/* Legal Column */}
          <div>
            <h3 className="text-slate-50 font-semibold mb-4">Legal</h3>
            <ul className="space-y-2">
              <li>
                <a 
                  href="/privacy-policy" 
                  onClick={(e) => handleLegalClick('privacy', e)}
                  className="text-slate-400 hover:text-cyan-400 transition-colors text-sm"
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a 
                  href="/terms-of-service" 
                  onClick={(e) => handleLegalClick('terms', e)}
                  className="text-slate-400 hover:text-cyan-400 transition-colors text-sm"
                >
                  Terms of Service
                </a>
              </li>
              <li>
                <a 
                  href="/cookie-policy" 
                  onClick={(e) => handleLegalClick('cookies', e)}
                  className="text-slate-400 hover:text-cyan-400 transition-colors text-sm"
                >
                  Cookie Policy
                </a>
              </li>
              <li>
                <a 
                  href="/acceptable-use" 
                  onClick={(e) => handleLegalClick('acceptable-use', e)}
                  className="text-slate-400 hover:text-cyan-400 transition-colors text-sm"
                >
                  Acceptable Use Policy
                </a>
              </li>
            </ul>
          </div>

          {/* Support Column */}
          <div>
            <h3 className="text-slate-50 font-semibold mb-4">Support</h3>
            <ul className="space-y-2">
              <li>
                <a href="mailto:support@realyn.com" className="text-slate-400 hover:text-cyan-400 transition-colors text-sm">
                  support@realyn.com
                </a>
              </li>
              <li>
                <a href="mailto:sales@realyn.com" className="text-slate-400 hover:text-cyan-400 transition-colors text-sm">
                  sales@realyn.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/10 pt-8">
          <p className="text-slate-500 text-sm">
            © {currentYear} Realyn. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

