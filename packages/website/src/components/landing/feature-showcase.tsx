import { EditorialSectionHeader } from "./EditorialSectionHeader"
import { WorkflowDataViz } from "./WorkflowDataViz"

export function FeatureShowcase() {
  return (
    <section className="relative overflow-hidden border-t border-white/10">
      <div className="container mx-auto px-4 sm:px-6">
        <EditorialSectionHeader
          number="02"
          label="HOW IT WORKS"
          title="How the system works"
          subtitle="Four stages from dispute detection to processor submission"
        />

        <div className="max-w-7xl mx-auto">
          <div className="hidden md:block h-px bg-white/10 mb-8" />

          <WorkflowDataViz />
        </div>
      </div>
    </section>
  )
}
