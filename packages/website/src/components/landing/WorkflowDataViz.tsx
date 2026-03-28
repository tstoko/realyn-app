import { Webhook, Tags, FileStack, Send, CheckCircle2, AlertCircle, Clock, FileText } from "lucide-react"
import { motion } from "framer-motion"

interface PipelineStage {
  icon: React.ElementType
  title: string
  description: string
  input: string
  output: string
}

const stages: PipelineStage[] = [
  {
    icon: Webhook,
    title: "Ingest",
    description: "Disputes detected from PSP webhooks in real time",
    input: "Stripe / Adyen webhook",
    output: "Categorized dispute record",
  },
  {
    icon: Tags,
    title: "Classify",
    description: "Reason code mapped, deadline set",
    input: "Dispute record",
    output: "Evidence checklist + SLA timer",
  },
  {
    icon: FileStack,
    title: "Assemble",
    description: "Transaction data and documents compiled",
    input: "Evidence checklist",
    output: "Evidence packet + confidence score",
  },
  {
    icon: Send,
    title: "Submit",
    description: "AI-drafted response submitted to processor",
    input: "Evidence packet",
    output: "Processor confirmation",
  },
]

function WebhookPanel() {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="w-full rounded-none border border-white/5 bg-slate-900/40 p-4 font-mono text-[10px] sm:text-xs text-slate-400 relative"
      id="panel-webhook"
    >
      <div className="absolute -right-1 top-1/2 w-2 h-2 bg-cyan-500 rounded-full transform -translate-y-1/2" />
      <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2">
        <Webhook className="w-4 h-4 text-cyan-400" />
        <span className="text-white uppercase tracking-wider text-[10px]">Ingest Payload</span>
      </div>
      <div className="text-cyan-400 mb-1">POST /v1/webhooks/stripe</div>
      <div className="text-slate-500">{"{"}</div>
      <div className="pl-4">"type": <span className="text-emerald-400">"charge.dispute.created"</span>,</div>
      <div className="pl-4">"data": {"{"}</div>
      <div className="pl-8">"object": {"{"}</div>
      <div className="pl-12">"id": <span className="text-emerald-400">"dp_1MowQ..."</span>,</div>
      <div className="pl-12">"amount": <span className="text-purple-400">48750</span>,</div>
      <div className="pl-12">"reason": <span className="text-emerald-400">"product_not_received"</span></div>
      <div className="pl-8">{"}"}</div>
      <div className="pl-4">{"}"}</div>
      <div className="text-slate-500">{"}"}</div>
    </motion.div>
  )
}

function TransactionPanel() {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="w-full rounded-none border border-white/5 bg-slate-900/40 p-4 relative"
      id="panel-transaction"
    >
      <div className="absolute -right-1 top-1/2 w-2 h-2 bg-cyan-500 rounded-full transform -translate-y-1/2" />
      <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2">
        <Tags className="w-4 h-4 text-cyan-400" />
        <span className="text-white font-mono uppercase tracking-wider text-[10px]">Matched Record</span>
      </div>
      <div className="space-y-2 font-mono text-[10px] sm:text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">Txn ID</span>
          <span className="text-slate-300">ch_3L9x...</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Customer</span>
          <span className="text-slate-300">sarah.j@email.com</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Card</span>
          <span className="text-slate-300">•••• 4242</span>
        </div>
        <div className="flex justify-between pt-2 border-t border-white/5">
          <span className="text-slate-500">Match Confidence</span>
          <span className="text-cyan-400">99.8%</span>
        </div>
      </div>
    </motion.div>
  )
}

function EvidencePanel() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="w-full rounded-none border border-white/5 bg-slate-900/40 p-4 relative"
      id="panel-evidence"
    >
      <div className="absolute -left-1 top-1/2 w-2 h-2 bg-cyan-500 rounded-full transform -translate-y-1/2" />
      <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2">
        <FileStack className="w-4 h-4 text-cyan-400" />
        <span className="text-white font-mono uppercase tracking-wider text-[10px]">Evidence Assembly</span>
      </div>
      <div className="space-y-3 font-mono text-[10px] sm:text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span className="text-slate-300">Receipt / Invoice</span>
          </div>
          <span className="text-slate-500">PDF</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span className="text-slate-300">Shipping Proof</span>
          </div>
          <span className="text-slate-500">API</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span className="text-slate-300">Customer Comms</span>
          </div>
          <span className="text-slate-500">Email</span>
        </div>
        <div className="flex items-center justify-between opacity-50">
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3 text-amber-400" />
            <span className="text-slate-300">TOS Agreement</span>
          </div>
          <span className="text-slate-500">Pending</span>
        </div>
      </div>
    </motion.div>
  )
}

function ResponsePanel() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="w-full rounded-none border border-white/5 bg-slate-900/40 p-4 relative"
      id="panel-response"
    >
      <div className="absolute -left-1 top-1/2 w-2 h-2 bg-cyan-500 rounded-full transform -translate-y-1/2" />
      <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2">
        <Send className="w-4 h-4 text-cyan-400" />
        <span className="text-white font-mono uppercase tracking-wider text-[10px]">AI Draft</span>
      </div>
      <div className="font-mono text-[10px] sm:text-xs text-slate-400 leading-relaxed">
        <p className="mb-2">To whom it may concern,</p>
        <p className="mb-2">We are writing to contest the dispute for charge <span className="text-cyan-400">ch_3L9x...</span> in the amount of <span className="text-cyan-400">$487.50</span>.</p>
        <p>The customer claims the merchandise was not received. However, we have attached tracking information showing delivery to the billing address on...</p>
      </div>
      <div className="mt-3 pt-2 border-t border-white/5 flex justify-between items-center text-[10px] font-mono">
        <span className="text-slate-500">Status</span>
        <span className="text-amber-400">Awaiting Review</span>
      </div>
    </motion.div>
  )
}

function MainDisputeHub() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="relative w-full max-w-sm mx-auto rounded-none border border-cyan-500/30 bg-slate-950 p-6 shadow-[0_0_30px_rgba(34,211,238,0.05)]"
      id="hub-center"
    >
      {/* Scanning animation overlay */}
      <motion.div
        animate={{ top: ["0%", "100%", "0%"] }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        className="absolute left-0 right-0 h-16 bg-gradient-to-b from-transparent via-cyan-500/10 to-transparent pointer-events-none z-0"
      />
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Active Dispute</span>
          </div>
          <span className="px-2 py-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-mono uppercase tracking-wider flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Processing
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-3xl font-bold text-white font-display mb-1">#78234</div>
            <div className="text-cyan-400 font-mono text-lg">$487.50</div>
          </div>

          <div className="p-3 bg-white/[0.02] border border-white/5 font-mono text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Reason Code</span>
              <span className="text-white">13.1</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Description</span>
              <span className="text-white text-right">Merchandise Not Received</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Deadline</span>
              <span className="text-amber-400">6d 14h</span>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex justify-between text-[10px] font-mono">
              <span className="text-slate-500">Overall Progress</span>
              <span className="text-cyan-400">65%</span>
            </div>
            <div className="h-1 w-full bg-white/5">
              <motion.div 
                className="h-full bg-cyan-400"
                initial={{ width: "0%" }}
                whileInView={{ width: "65%" }}
                transition={{ duration: 1, delay: 0.5 }}
              />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function OrthogonalConnectors() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none hidden lg:block"
      style={{ zIndex: 0 }}
    >
      <defs>
        <filter id="ortho-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="0 0 0 0 0.04  0 0 0 0 0.73  0 0 0 0 0.83  0 0 0 0.5 0"
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      
      {/* 
        These paths represent orthogonal connections. 
        We use percentages to keep it responsive within the grid.
        Grid is 3 columns: 1fr auto 1fr. Max width 1024px.
        Left panels are 280px wide. Right panels are 280px wide.
        Center hub is 320px wide.
        Left dot X: ~28%
        Right dot X: ~72%
        Center hub left X: ~34%
        Center hub right X: ~66%
      */}
      <g filter="url(#ortho-glow)" stroke="rgb(34 211 238)" strokeWidth="1" fill="none" strokeOpacity="0.4">
        {/* Top Left (Webhook) to Center */}
        <line x1="28%" y1="25%" x2="31%" y2="25%" />
        <line x1="31%" y1="25%" x2="31%" y2="50%" />
        <line x1="31%" y1="50%" x2="34%" y2="50%" />
        <circle cx="28%" cy="25%" r="2" fill="rgb(34 211 238)" stroke="none" />
        <circle cx="34%" cy="50%" r="2" fill="rgb(34 211 238)" stroke="none" />
        
        {/* Bottom Left (Transaction) to Center */}
        <line x1="28%" y1="75%" x2="31%" y2="75%" />
        <line x1="31%" y1="75%" x2="31%" y2="50%" />
        <line x1="31%" y1="50%" x2="34%" y2="50%" />
        <circle cx="28%" cy="75%" r="2" fill="rgb(34 211 238)" stroke="none" />
        
        {/* Center to Top Right (Evidence) */}
        <line x1="66%" y1="50%" x2="69%" y2="50%" />
        <line x1="69%" y1="50%" x2="69%" y2="25%" />
        <line x1="69%" y1="25%" x2="72%" y2="25%" />
        <circle cx="66%" cy="50%" r="2" fill="rgb(34 211 238)" stroke="none" />
        <circle cx="72%" cy="25%" r="2" fill="rgb(34 211 238)" stroke="none" />
        
        {/* Center to Bottom Right (Response) */}
        <line x1="66%" y1="50%" x2="69%" y2="50%" />
        <line x1="69%" y1="50%" x2="69%" y2="75%" />
        <line x1="69%" y1="75%" x2="72%" y2="75%" />
        <circle cx="72%" cy="75%" r="2" fill="rgb(34 211 238)" stroke="none" />
      </g>
    </svg>
  )
}

function MobileStack() {
  return (
    <div className="flex flex-col gap-4 lg:hidden">
      {stages.map((stage, index) => {
        const Icon = stage.icon
        return (
          <motion.div
            key={stage.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: index * 0.08 }}
            className="flex items-start gap-4 p-4 rounded-none border border-white/10 bg-white/[0.02]"
          >
            <div className="w-10 h-10 rounded-none border border-white/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-white font-display">{stage.title}</h3>
              <p className="text-sm text-slate-400 mt-1">{stage.description}</p>
              <div className="flex flex-wrap gap-4 mt-2 text-xs">
                <span className="font-mono text-slate-600">
                  IN: <span className="text-slate-400">{stage.input}</span>
                </span>
                <span className="font-mono text-cyan-400">
                  OUT: <span className="text-slate-300">{stage.output}</span>
                </span>
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

export function WorkflowDataViz() {
  return (
    <>
      <MobileStack />
      
      {/* Desktop (lg+): Dashboard command-center grid */}
      <div className="hidden lg:grid grid-cols-[1fr_auto_1fr] gap-8 items-center relative w-full max-w-5xl mx-auto min-h-[500px] py-12">
        <OrthogonalConnectors />
        
        {/* Left Column: Inputs */}
        <div className="flex flex-col gap-16 justify-center z-10 w-[280px]">
          <WebhookPanel />
          <TransactionPanel />
        </div>

        {/* Center Column: Hub */}
        <div className="z-10 w-[320px]">
          <MainDisputeHub />
        </div>

        {/* Right Column: Outputs */}
        <div className="flex flex-col gap-16 justify-center z-10 w-[280px] justify-self-end">
          <EvidencePanel />
          <ResponsePanel />
        </div>
      </div>
    </>
  )
}
