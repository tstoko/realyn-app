import React, { useState } from "react"
import { Button, Input, Label, Textarea, Logo, submitContactSalesForm } from "@realyn/shared"
import { ArrowLeftIcon } from "@radix-ui/react-icons"

interface ContactSalesPageProps {
  onBack: () => void
}

export const ContactSalesPage: React.FC<ContactSalesPageProps> = ({ onBack }) => {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    jobTitle: "",
    industry: "",
    industryOther: "",
    companySize: "",
    currentPlatform: "",
    currentPaymentProcessor: "",
    currentPaymentProcessorOther: "",
    monthlyTransactionVolume: "",
    howDidYouHear: "",
    howDidYouHearOther: "",
    message: "",
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const requiredFields = ["firstName", "lastName", "email", "phone", "company", "jobTitle"] as const

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: "" }))
    }
  }

  const validate = (): boolean => {
    const errors: Record<string, string> = {}
    for (const field of requiredFields) {
      if (!formData[field]?.trim()) {
        const labels: Record<string, string> = {
          firstName: "First Name",
          lastName: "Last Name",
          email: "Email",
          phone: "Phone Number",
          company: "Company/Organization Name",
          jobTitle: "Job Title",
        }
        errors[field] = `${labels[field]} is required`
      }
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)
    setSubmitStatus("idle")
    setFieldErrors({})

    try {
      await submitContactSalesForm({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        company: formData.company,
        jobTitle: formData.jobTitle,
        industry: formData.industry,
        industryOther: formData.industryOther,
        companySize: formData.companySize,
        currentPlatform: formData.currentPlatform,
        currentPaymentProcessor: formData.currentPaymentProcessor,
        currentPaymentProcessorOther: formData.currentPaymentProcessorOther,
        monthlyTransactionVolume: formData.monthlyTransactionVolume,
        howDidYouHear: formData.howDidYouHear,
        howDidYouHearOther: formData.howDidYouHearOther,
        message: formData.message,
      })
      
      setSubmitStatus("success")
      // Reset form after successful submission
      setTimeout(() => {
        setFormData({
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          company: "",
          jobTitle: "",
          industry: "",
          industryOther: "",
          companySize: "",
          currentPlatform: "",
          currentPaymentProcessor: "",
          currentPaymentProcessorOther: "",
          monthlyTransactionVolume: "",
          howDidYouHear: "",
          howDidYouHearOther: "",
          message: "",
        })
        setSubmitStatus("idle")
      }, 3000)
    } catch (error) {
      console.error('Error submitting contact sales form:', error)
      setSubmitStatus("error")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-slate-50 overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/95 border-b border-white/10">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo className="h-20 w-auto" />
          </div>
          <Button
            onClick={onBack}
            variant="ghost"
            size="sm"
            className="rounded-none font-mono text-xs uppercase tracking-widest text-slate-400 hover:text-white border border-white/20 hover:border-white/40 px-5 py-3 transition-colors"
          >
            <ArrowLeftIcon className="mr-2 w-4 h-4" />
            Back
          </Button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative pt-32 pb-20">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-12">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
              Contact Sales
            </h1>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Let's discuss how Realyn can help protect your revenue from chargebacks. Fill out the form below and our team will get back to you shortly.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8 bg-black rounded-none p-5 sm:p-8 md:p-12 border border-white/10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            {/* Personal Information */}
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-slate-50 border-b border-white/10 pb-2">
                Personal Information
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-slate-300">
                    First Name <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={handleChange}
                    className={`bg-slate-800 border-slate-700 text-slate-50 focus:border-cyan-400 focus:ring-cyan-400 ${fieldErrors.firstName ? "border-red-500/50" : ""}`}
                    placeholder="John"
                  />
                  {fieldErrors.firstName && (
                    <p className="text-sm text-red-400">{fieldErrors.firstName}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-slate-300">
                    Last Name <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={handleChange}
                    className={`bg-slate-800 border-slate-700 text-slate-50 focus:border-cyan-400 focus:ring-cyan-400 ${fieldErrors.lastName ? "border-red-500/50" : ""}`}
                    placeholder="Doe"
                  />
                  {fieldErrors.lastName && (
                    <p className="text-sm text-red-400">{fieldErrors.lastName}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-300">
                    Email <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className={`bg-slate-800 border-slate-700 text-slate-50 focus:border-cyan-400 focus:ring-cyan-400 ${fieldErrors.email ? "border-red-500/50" : ""}`}
                    placeholder="john@company.com"
                  />
                  {fieldErrors.email && (
                    <p className="text-sm text-red-400">{fieldErrors.email}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-slate-300">
                    Phone Number <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={handleChange}
                    className={`bg-slate-800 border-slate-700 text-slate-50 focus:border-cyan-400 focus:ring-cyan-400 ${fieldErrors.phone ? "border-red-500/50" : ""}`}
                    placeholder="+1 (555) 123-4567"
                  />
                  {fieldErrors.phone && (
                    <p className="text-sm text-red-400">{fieldErrors.phone}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Company Information */}
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-slate-50 border-b border-white/10 pb-2">
                Company Information
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="company" className="text-slate-300">
                    Company/Organization Name <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="company"
                    name="company"
                    type="text"
                    required
                    value={formData.company}
                    onChange={handleChange}
                    className={`bg-slate-800 border-slate-700 text-slate-50 focus:border-cyan-400 focus:ring-cyan-400 ${fieldErrors.company ? "border-red-500/50" : ""}`}
                    placeholder="Acme Inc."
                  />
                  {fieldErrors.company && (
                    <p className="text-sm text-red-400">{fieldErrors.company}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="jobTitle" className="text-slate-300">
                    Job Title <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="jobTitle"
                    name="jobTitle"
                    type="text"
                    required
                    value={formData.jobTitle}
                    onChange={handleChange}
                    className={`bg-slate-800 border-slate-700 text-slate-50 focus:border-cyan-400 focus:ring-cyan-400 ${fieldErrors.jobTitle ? "border-red-500/50" : ""}`}
                    placeholder="Head of Finance"
                  />
                  {fieldErrors.jobTitle && (
                    <p className="text-sm text-red-400">{fieldErrors.jobTitle}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="industry" className="text-slate-300">
                    Industry
                  </Label>
                  <select
                    id="industry"
                    name="industry"
                    value={formData.industry}
                    onChange={handleChange}
                    className="flex h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-50 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Select Industry</option>
                    <option value="hospitality">Hospitality</option>
                    <option value="ecommerce">E-commerce</option>
                    <option value="retail">Retail</option>
                    <option value="saas">SaaS / Technology</option>
                    <option value="financial-services">Financial Services</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="travel">Travel & Transportation</option>
                    <option value="other">Other</option>
                  </select>
                  {formData.industry === "other" && (
                    <Input
                      id="industryOther"
                      name="industryOther"
                      type="text"
                      value={formData.industryOther}
                      onChange={handleChange}
                      className="bg-slate-800 border-slate-700 text-slate-50 focus:border-cyan-400 focus:ring-cyan-400 mt-2"
                      placeholder="Please specify your industry"
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companySize" className="text-slate-300">
                    Company Size
                  </Label>
                  <select
                    id="companySize"
                    name="companySize"
                    value={formData.companySize}
                    onChange={handleChange}
                    className="flex h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-50 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Select Company Size</option>
                    <option value="1-10">1 - 10 employees</option>
                    <option value="11-50">11 - 50 employees</option>
                    <option value="51-200">51 - 200 employees</option>
                    <option value="201-500">201 - 500 employees</option>
                    <option value="500+">500+ employees</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Current Systems */}
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-slate-50 border-b border-white/10 pb-2">
                Current Systems
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="currentPlatform" className="text-slate-300">
                    Current Business Management Platform
                  </Label>
                  <Input
                    id="currentPlatform"
                    name="currentPlatform"
                    type="text"
                    value={formData.currentPlatform}
                    onChange={handleChange}
                    className="bg-slate-800 border-slate-700 text-slate-50 focus:border-cyan-400 focus:ring-cyan-400"
                    placeholder="e.g. Salesforce, SAP, Shopify"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="currentPaymentProcessor" className="text-slate-300">
                    Current Payment Processor
                  </Label>
                  <select
                    id="currentPaymentProcessor"
                    name="currentPaymentProcessor"
                    value={formData.currentPaymentProcessor}
                    onChange={handleChange}
                    className="flex h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-50 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Select Payment Processor</option>
                    <option value="adyen">Adyen</option>
                    <option value="stripe">Stripe</option>
                    <option value="square">Square</option>
                    <option value="paypal">PayPal</option>
                    <option value="other">Other</option>
                  </select>
                  {formData.currentPaymentProcessor === "other" && (
                    <Input
                      id="currentPaymentProcessorOther"
                      name="currentPaymentProcessorOther"
                      type="text"
                      value={formData.currentPaymentProcessorOther}
                      onChange={handleChange}
                      className="bg-slate-800 border-slate-700 text-slate-50 focus:border-cyan-400 focus:ring-cyan-400 mt-2"
                      placeholder="Please specify your payment processor"
                    />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="monthlyTransactionVolume" className="text-slate-300">
                  Monthly Transaction Volume (USD)
                </Label>
                <select
                  id="monthlyTransactionVolume"
                  name="monthlyTransactionVolume"
                  value={formData.monthlyTransactionVolume}
                  onChange={handleChange}
                  className="flex h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-50 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Select Range</option>
                  <option value="0-50k">$0 - $50,000</option>
                  <option value="50k-100k">$50,000 - $100,000</option>
                  <option value="100k-250k">$100,000 - $250,000</option>
                  <option value="250k-500k">$250,000 - $500,000</option>
                  <option value="500k-1m">$500,000 - $1,000,000</option>
                  <option value="1m+">$1,000,000+</option>
                </select>
              </div>
            </div>

            {/* Additional Information */}
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-slate-50 border-b border-white/10 pb-2">
                Additional Information
              </h2>
              
              <div className="space-y-2">
                <Label htmlFor="howDidYouHear" className="text-slate-300">
                  How did you hear about us?
                </Label>
                <select
                  id="howDidYouHear"
                  name="howDidYouHear"
                  value={formData.howDidYouHear}
                  onChange={handleChange}
                  className="flex h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-50 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Select an option</option>
                  <option value="search">Search Engine</option>
                  <option value="social">Social Media</option>
                  <option value="referral">Referral</option>
                  <option value="event">Industry Event</option>
                  <option value="partner">Partner</option>
                  <option value="other">Other</option>
                </select>
                {formData.howDidYouHear === "other" && (
                  <Input
                    id="howDidYouHearOther"
                    name="howDidYouHearOther"
                    type="text"
                    value={formData.howDidYouHearOther}
                    onChange={handleChange}
                    className="bg-slate-800 border-slate-700 text-slate-50 focus:border-cyan-400 focus:ring-cyan-400 mt-2"
                    placeholder="Please specify how you heard about us"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="message" className="text-slate-300">
                  Message / Additional Information
                </Label>
                <Textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  rows={5}
                  className="bg-slate-800 border-slate-700 text-slate-50 focus:border-cyan-400 focus:ring-cyan-400"
                  placeholder="Tell us about your specific needs, challenges, or questions..."
                />
              </div>
            </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              {submitStatus === "success" && (
                <div className="mb-4 p-4 bg-green-500/10 border border-green-500/20 rounded-none text-green-400">
                  Thank you! We've received your request and will contact you shortly.
                </div>
              )}
              
              {submitStatus === "error" && (
                <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-none text-red-400">
                  There was an error submitting your request. Please try again.
                </div>
              )}

              {submitStatus !== "success" && (
                <Button
                  type="submit"
                  size="lg"
                  disabled={isSubmitting}
                  className="w-full rounded-none font-mono text-xs uppercase tracking-[0.2em] py-4 bg-white text-black hover:bg-cyan-400 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "Submitting..." : "Submit Request"}
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

