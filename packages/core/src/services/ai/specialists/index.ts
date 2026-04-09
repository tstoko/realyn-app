/**
 * Evidence Planning Specialists
 *
 * Barrel export for all specialist modules used in the enhanced
 * evidence planning pipeline.
 */

// Claim Analyst - Analyzes customer claims to identify what needs to be disproven
export { analyzeClaim, generateFallbackClaimAnalysis } from "./claimAnalyst";

// Evidence Analyzer - Analyzes existing organization documents
export { analyzeExistingEvidence } from "./evidenceAnalyzer";

// Evidence Relevance Scorer - Scores evidence relevance for the specific dispute
export { scoreEvidenceRelevance } from "./evidenceRelevanceScorer";

// Evidence Plan Quality Checker - Validates plans before showing to user
export { checkEvidencePlanQuality } from "./evidencePlanChecker";

// Strategy Advisor - Synthesizes overall dispute strategy from specialist analyses
export { synthesizeStrategy, generateFallbackStrategy } from "./strategyAdvisor";

