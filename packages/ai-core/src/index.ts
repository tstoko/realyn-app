// =============================================================================
// Types
// =============================================================================

export type {
  EvidenceCategory,
  EvidenceRequirement,
  EvidenceRequirementStatus,
  EvidenceItem,
  EvidencePlan,
  DisputeCase,
  DisputeArgument,
  BookingInfo,
  GuestInfo,
  HotelProfile,
  PaymentData,
  ClaimAnalysis,
  ClaimType,
  ExistingEvidenceAnalysis,
  EvidenceRelevanceScores,
  EvidenceRelevanceScore,
  EvidencePlanQualityCheck,
  QualityIssue,
  RevisionInstructions,
  DisputeStrategy,
  DefensePoint,
  EvidencePriority,
  SpecialistContext,
  AttemptContext,
  EvidencePlanVersion,
  ArgumentVersion,
  ArgumentParagraph,
  TimelineEvent,
} from "./types/aiDispute";

export {
  EvidenceCategorySchema,
  EvidenceRequirementSchema,
  EvidenceRequirementStatusSchema,
  EvidenceItemSchema,
  EvidencePlanSchema,
  DisputeCaseSchema,
  DisputeArgumentSchema,
  ClaimAnalysisSchema,
  ClaimTypeSchema,
  ExistingEvidenceAnalysisSchema,
  EvidenceRelevanceScoresSchema,
  EvidencePlanQualityCheckSchema,
  DisputeStrategySchema,
  CardNetworkSchema,
  initializeEvidenceItems,
  getCategoryDisplayName,
  getCategoryIcon,
} from "./types/aiDispute";

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

// =============================================================================
// Config
// =============================================================================

export type { CardNetwork, DisputeCodeInfo } from "./config/disputeCodeMapping";

export {
  getDisputeCodeInfo,
  detectNetworkFromCode,
  mapStripeReasonToCode,
  generateEvidenceRequirements,
  ALL_DISPUTE_CODES,
} from "./config/disputeCodeMapping";

// =============================================================================
// Ports (dependency inversion interfaces)
// =============================================================================

export type {
  EvidenceLoader,
  OrgDocumentLoader,
  KBProvider,
  PMSMatchResult,
  PMSReservation,
  PMSFolio,
  PMSFolioLine,
  PMSActivityLog,
  EnrichedEvidence,
  EvidenceFile,
  EvidenceSlot,
  DraftValidationResult,
  ClaimValidation,
  WeakClaim,
  UnsupportedClaim,
  MissingPspField,
  OverallSupport,
  SubmissionRisk,
  OrgDocument,
} from "./ports";

export { EVIDENCE_SLOT_DESCRIPTIONS } from "./ports";

// =============================================================================
// AI Services
// =============================================================================

export {
  callLLM,
  callLLMWithVision,
  callLLMWithTemplate,
  getTextCompletion,
  isLLMAvailable,
  getLLMInitError,
  estimateTokens,
  truncateToTokenLimit,
} from "./services/llmService";

export type {
  LLMCallOptions,
  LLMVisionCallOptions,
  LLMCallResult,
  ImageInput,
} from "./services/llmService";

export { buildDisputeContextBlock } from "./services/promptHelpers";
export type { DisputeContextOptions } from "./services/promptHelpers";

export {
  generateEvidencePlan,
  resolveDisputeCode,
  mergeRequirements,
  areLabelsSimilar,
  applyFolioDedup,
  applyCodeBasedMerge,
} from "./services/evidencePlanner";

export { generateDisputeArgument } from "./services/argumentGenerator";
export type { ArgumentGeneratorContext } from "./services/argumentGenerator";

// Specialists
export {
  analyzeClaim,
  generateFallbackClaimAnalysis,
  analyzeExistingEvidence,
  scoreEvidenceRelevance,
  checkEvidencePlanQuality,
  synthesizeStrategy,
  generateFallbackStrategy,
} from "./services/specialists";

export type { ClaimAnalystOptions } from "./services/specialists/claimAnalyst";
export type { StrategyAdvisorKBContext } from "./services/specialists/strategyAdvisor";

// =============================================================================
// Verticals
// =============================================================================

export type { VerticalDefinition } from "./verticals/types";
export { verticalRegistry } from "./verticals/registry";

// =============================================================================
// Utils
// =============================================================================

export {
  sanitizeDisputeCase,
  sanitizeDisputeCaseWithLog,
  sanitizeText,
  sanitizePdfContent,
  sanitizeName,
  sanitizeEmail,
  sanitizePhone,
  sanitizeCardLast4,
  sanitizeGuestInfo,
  sanitizeBookingInfo,
  logSanitizationSummary,
  PII_PLACEHOLDERS,
} from "./utils/piiSanitizer";

// =============================================================================
// Telemetry
// =============================================================================

export type { AITelemetryEvent, AITelemetryEmitter, TelemetryContext } from "./telemetry";
export { nullTelemetryEmitter, configureTelemetry, getTelemetryEmitter } from "./telemetry";
