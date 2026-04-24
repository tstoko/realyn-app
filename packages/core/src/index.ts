// Types - re-export with explicit names to avoid collisions
export type {
  EvidenceCategory,
  EvidenceRequirement,
  EvidencePlan,
  DisputeCase,
  DisputeArgument,
  ClaimAnalysis,
  DisputeStrategy,
  SpecialistContext,
} from "./types/aiDispute";

export type {
  DisputeCodeInfo,
} from "./config/disputeCodeMapping";

export {
  ALL_DISPUTE_CODES,
  detectNetworkFromCode,
  getDisputeCodeInfo,
  getCommonHotelDisputeCodes,
  mapStripeReasonToCode,
  generateEvidenceRequirements,
  getCategoryDisplayName,
  getCategoryIcon,
} from "./config/disputeCodeMapping";

export type { CardNetwork } from "./config/disputeCodeMapping";

export type {
  PSPType,
  PSPIntegrationBase,
  StripeIntegration,
  AdyenIntegration,
  PSPIntegrations,
  AutomationSettings,
  Team,
  HotelDocument,
  HotelUser,
  PMSIntegrationConfig,
  Organization,
} from "./types/organization";

export * from "./config/environment";

// Utils
export type {
  AuditTrailActor,
  AuditTrailCategory,
  AuditTrailMetadata,
  AuditTrailRelatedResources,
} from "./utils/auditTrailHelper";
export {
  addAuditTrailEntry,
  createUserAuditEntry,
  createSystemAuditEntry,
  createErrorAuditEntry,
} from "./utils/auditTrailHelper";

export {
  encrypt,
  decrypt,
  encryptCredentials,
  decryptCredentials,
  isEncryptionAvailable,
} from "./utils/encryption";

export {
  sanitizeDisputeCase,
  sanitizeDisputeCaseWithLog,
  sanitizeGuestInfo,
  sanitizeBookingInfo,
} from "./utils/piiSanitizer";

// Services
export {
  getOrganization,
  getAllOrganizations,
  getOrganizationByStripeMerchant,
  getOrganizationByAdyenMerchant,
  createOrganization,
  updateOrganization,
  deleteOrganization,
} from "./services/organizationService";

export {
  upsertUnifiedDispute,
  updateDisputeStatus,
} from "./services/disputeService";

export {
  savePspIntegrations,
  saveOperaCloudIntegration,
  encryptPspIntegrations,
  encryptOperaCloudConfig,
} from "./services/integrationWriteService";

// AI Services
export {
  triggerEvidencePlanning,
  regenerateEvidencePlan,
  updateEvidenceItemStatus,
  getEvidenceProgress,
  toggleAIPlanMode,
} from "./services/ai/evidencePlanningService";

export { generateDisputeArgument } from "./services/ai/argumentGenerator";
export { buildDisputeCase, summarizeDisputeCase } from "./services/ai/disputeCaseBuilder";
export { getTextCompletion } from "./services/ai/llmService";
export { validateDraft } from "./services/ai/draftValidator";
export type { DraftValidationResult, OverallSupport, SubmissionRisk } from "./services/ai/draftValidator";

// PMS Services
export { autoCollectFromPMS } from "./services/pms/evidenceAutoCollector";

// Text Extractor
export {
  extractFolioText,
  extractReservationText,
  extractActivityLogText,
} from "./services/textExtractor";

// PSP Services
export { createPSPAdapter } from "./services/psp/pspFactory";
export type { PSPAdapter, PSPEvidenceMapper } from "./services/psp/types";

// Operation Service
export {
  createOperation,
  updateOperationProgress,
  completeOperation,
  failOperation,
  getOperation,
  listOperations,
} from "./services/operationService";
export type { Operation, OperationType, OperationStatus, OperationProgress, OperationError } from "./services/operationService";

// Task Service
export {
  createTask,
  updateTaskStatus,
  getOpenTasks,
  getTasksByOrg,
} from "./services/taskService";
export type { Task, TaskType, TaskPriority, TaskStatus, TaskMetadata } from "./services/taskService";

// Readiness Service
export {
  assessReadiness,
  getLatestReadiness,
} from "./services/readinessService";
export type { ReadinessAssessment, EvidenceCompleteness, DeadlineRisk, OverallReadiness, BlockingIssue } from "./services/readinessService";

// Knowledge Base Service
export {
  getSchemeRule,
  getEvidenceRequirements,
  getPSPFormats,
  getOutputTemplate,
  getWinPatterns,
  assembleContext as assembleKnowledgeContext,
} from "./services/knowledgeBaseService";

// Knowledge Base Admin Service
export {
  importSchemeRules,
  importEvidenceRequirements,
  importPSPFormats,
  importOutputTemplates,
  importWinPatterns,
  clearCollection as clearKBCollection,
} from "./services/knowledgeBaseAdmin";

// Win Pattern Service (feedback loop)
export { recordDisputeOutcome } from "./services/winPatternService";
export type { DisputeOutcome } from "./services/winPatternService";

// Ruleset Service
export {
  getActiveRuleset,
  getApplicableRules,
  importRuleset,
  diffRulesets,
  seedFromStaticMapping,
} from "./services/rulesetService";
export type { Ruleset, DisputeRule, RulesetDiff } from "./services/rulesetService";

// Knowledge Base Types
export type {
  SchemeRule,
  SchemeRuleCitation,
  SchemeRuleTimeLimit,
  EvidenceRequirementRule,
  EvidenceRequirementItem,
  EvidencePriority as KBEvidencePriority,
  PSPFormatRule,
  PSPProvider,
  AcceptedFormat,
  EvidenceOutputTemplate,
  OutputFormat,
  ExtractionMethod,
  WinPattern,
  KnowledgeContext,
} from "./types/knowledgeBase";
export {
  KB_COLLECTIONS,
  schemeRuleDocId,
  evidenceRequirementDocId,
  pspFormatDocId,
  outputTemplateDocId,
  winPatternDocId,
} from "./types/knowledgeBase";

// Vertical Registry
export { verticalRegistry } from "./verticals/registry";
export type { VerticalDefinition } from "./verticals/types";
export { hospitalityVertical } from "./verticals/hospitality/index";
export { ticketingVertical } from "./verticals/ticketing/index";
export { generalVertical } from "./verticals/general/index";
