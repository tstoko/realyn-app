/**
 * @realyn/ontology — canonical types and schemas for the Realyn platform.
 *
 * This package is the single source of truth for entity shapes shared
 * across `@realyn/dashboard`, `@realyn/ai-core`, and `functions`. New
 * persisted entities should land here first, then be consumed by the
 * other packages.
 *
 * See:
 *   - docs/adr/0001-ontology.md     Architectural rationale
 *   - docs/partner-readiness-plan.md §P0.3 / W1.1
 *
 * Currently 0.x. The surface is intentionally unstable; expect renames
 * and tightening until 1.0.
 */

export { ONTOLOGY_VERSION } from "./version";
export type { OntologyVersionStamp } from "./version";

export type { Timestamp, FirestoreDate } from "./timestamp";

export type { User, UserPreferences, UserRole } from "./user";
export { userRoleSchema, userSchema } from "./user";

export type {
  EvidenceCategory,
  EvidenceRequirementStatus,
  EvidenceRequirement,
  EvidenceItem,
  CardNetwork,
  PlanRecommendation,
  Winnability,
  EvidencePlan,
} from "./evidence";
export {
  evidenceCategorySchema,
  evidenceRequirementStatusSchema,
  evidenceRequirementSchema,
  evidenceItemSchema,
  cardNetworkSchema,
  planRecommendationSchema,
  winnabilitySchema,
  evidencePlanSchema,
} from "./evidence";

export type {
  TimelineEvent,
  ArgumentParagraph,
  DisputeArgument,
  ArgumentVersion,
} from "./argument";
export {
  timelineEventSchema,
  argumentParagraphSchema,
  disputeArgumentSchema,
} from "./argument";

export type {
  DisputeStatus,
  AutomationStatus,
  DisputeLifecycleStatus,
  InternalStatus,
  Note,
  AuditTrailCategory,
  AutomationStep,
  Dispute,
  FilterState,
  SortState,
} from "./dispute";
export {
  disputeStatusSchema,
  automationStatusSchema,
  disputeLifecycleStatusSchema,
  internalStatusSchema,
  auditTrailCategorySchema,
  disputeSchema,
} from "./dispute";

export type {
  DocumentCategory,
  HotelDocument,
  HotelUser,
  Team,
  InviteStatus,
  Invite,
  AutomationSettings,
  PSPIntegration,
  PSPIntegrationBase,
  StripeIntegrationConfig,
  AdyenIntegrationConfig,
  PSPIntegrationsConfig,
  PMSIntegration,
  OperaCloudIntegration,
  Hotel,
  Organization,
  ActivityLogItem,
} from "./org";
export {
  inviteStatusSchema,
  automationSettingsSchema,
  organizationSchema,
} from "./org";

export type {
  SubscriptionStatus,
  Subscription,
  PlanFeatures,
  Plan,
} from "./billing";
export {
  subscriptionStatusSchema,
  subscriptionSchema,
  PLANS,
  getPlanById,
  isSubscriptionActive,
} from "./billing";

export type { Outcome } from "./outcome";
export { outcomeSchema } from "./outcome";

export type { AuditEvent } from "./audit";
export { auditEventSchema } from "./audit";
