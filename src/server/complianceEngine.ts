import { CampaignProfile, ComplianceResult, ComplianceViolation, CustomRegexRule } from './types';

// Default standard profiles
export const DEFAULT_CAMPAIGN_PROFILES: CampaignProfile[] = [
  {
    id: 'general_creator',
    name: 'General Creator / Safe Brand Standards',
    allowedTerms: [],
    prohibitedTerms: ['cure all', 'guaranteed wealth', '100% risk free', 'get rich quick', 'miracle cure', 'secret glitch'],
    requiredTerms: [],
    prohibitedClaimTypes: ['medical_cure', 'financial_guarantee', 'absolute_outcome'],
    customRules: ['Avoid absolute claims regarding health or monetary returns'],
    regexRules: [
      {
        id: 'r_guarantee',
        name: 'Guaranteed Return Claim',
        pattern: '\\b(guaranteed?|promise(s|d)?)\\s+(profit|money|income|roi|return)',
        action: 'BLOCK',
        reason: 'Explicitly guarantees financial returns, which violates creator advertising standards.',
        suggestedAction: 'Qualify statements to discuss potential or past observations rather than guarantees.'
      }
    ]
  },
  {
    id: 'health_wellness',
    name: 'Health & Wellness Compliance',
    allowedTerms: ['supports', 'maintains', 'may help', 'formulated with'],
    prohibitedTerms: ['cures', 'treats', 'prevents cancer', 'eradicates disease', 'miracle remedy', 'fights disease'],
    requiredTerms: ['consult your doctor', 'dietary supplement'],
    prohibitedClaimTypes: ['disease_treatment', 'prescriptive_cure'],
    customRules: ['Must include disclaimer if discussing health supplements'],
    regexRules: [
      {
        id: 'r_fda',
        name: 'FDA Approval Claim',
        pattern: 'fda\\s+(approved|cleared|certified)',
        action: 'BLOCK',
        reason: 'Claiming FDA approval on dietary supplements or content is prohibited.',
        suggestedAction: 'State that product is produced in an inspected facility without claiming FDA product approval.'
      },
      {
        id: 'r_cure',
        name: 'Medical Treatment Claim',
        pattern: '\\b(cure|treat|prevent|heal)(s|d|ing)?\\s+(cancer|diabetes|arthritis|disease)',
        action: 'WARNING',
        reason: 'Medical treatment claims require qualified substantiation.',
        suggestedAction: 'Use permitted phrasing such as "supports overall vitality" or "maintains healthy cellular function".'
      }
    ]
  },
  {
    id: 'education_tech',
    name: 'Tech & Education Guidelines',
    allowedTerms: [],
    prohibitedTerms: ['hack passwords', 'bypass security', 'free cracked software'],
    requiredTerms: [],
    prohibitedClaimTypes: ['unauthorized_access', 'piracy'],
    customRules: ['Educational context only'],
    regexRules: [
      {
        id: 'r_exploit',
        name: 'Exploitation Instructions',
        pattern: '\\b(steal|crack|bypass|hack)\\s+(password|credential|database|account)',
        action: 'BLOCK',
        reason: 'Content appears to describe unauthorized access or illegal bypass mechanisms.',
        suggestedAction: 'Emphasize defensive cybersecurity concepts rather than exploit methods.'
      }
    ]
  }
];

export class ComplianceEngine {
  /**
   * Validates custom regex patterns to protect against catastrophic backtracking and invalid syntax.
   */
  static validateRegexPattern(pattern: string): { valid: boolean; error?: string } {
    if (!pattern || typeof pattern !== 'string') {
      return { valid: false, error: 'Pattern cannot be empty.' };
    }

    const trimmed = pattern.trim();
    if (trimmed.length > 200) {
      return { valid: false, error: 'Pattern is too long (maximum 200 characters allowed).' };
    }

    // Detect dangerous nested quantifiers prone to exponential catastrophic backtracking (ReDoS)
    const dangerousBacktracking = /(\([^()]*[+*][^()]*\)[+*]|\([^()]*[+*][^()]*\)\{[0-9]+,\})/i;
    if (dangerousBacktracking.test(trimmed)) {
      return {
        valid: false,
        error: 'Dangerous nested quantifier detected. Nested repetition (e.g. (a+)+ or (x*)*) is not allowed.'
      };
    }

    try {
      const regex = new RegExp(trimmed, 'i');
      // Benchmark execution with a sample string to verify termination
      const bench = 'The quick brown fox jumps over the lazy dog 12345';
      regex.test(bench);
      return { valid: true };
    } catch (e: any) {
      return { valid: false, error: `Invalid regular expression syntax: ${e.message}` };
    }
  }

  /**
   * Scans transcript, hook, and captions against campaign guidelines.
   */
  static evaluateClip(
    transcriptText: string,
    hookText: string,
    profile?: CampaignProfile
  ): ComplianceResult {
    const violations: ComplianceViolation[] = [];
    const activeProfile = profile || DEFAULT_CAMPAIGN_PROFILES[0];
    const combinedText = `${hookText || ''} ${transcriptText || ''}`.toLowerCase();

    // 1. Prohibited terms check
    for (const term of activeProfile.prohibitedTerms) {
      const lowerTerm = term.toLowerCase();
      if (combinedText.includes(lowerTerm)) {
        violations.push({
          matchedText: term,
          matchedRule: `Prohibited term in ${activeProfile.name}`,
          severity: 'BLOCK',
          reason: `Text includes explicit prohibited phrase "${term}".`,
          suggestedAction: `Remove or rephrase "${term}" to avoid compliance violations.`
        });
      }
    }

    // 2. Prohibited Claim Types (Absolute medical or financial guarantees)
    const absolutePatterns = [
      { pattern: /\b(guarantee|guaranteed|promise)\b.*\b(profit|money|income|return)\b/i, claim: 'financial_guarantee' },
      { pattern: /\b(cure|cures|heals)\b.*\b(all disease|cancer|illness)\b/i, claim: 'medical_cure' },
      { pattern: /\b(never fail|100% foolproof|infinite money)\b/i, claim: 'absolute_outcome' }
    ];

    for (const item of absolutePatterns) {
      const match = combinedText.match(item.pattern);
      if (match) {
        violations.push({
          matchedText: match[0],
          matchedRule: `Prohibited claim category: ${item.claim}`,
          severity: 'WARNING',
          reason: `Detected unqualified absolute assertion: "${match[0]}".`,
          suggestedAction: 'Qualify claim with observational or educational context rather than guarantee.'
        });
      }
    }

    // 3. Custom Regex Rules Check
    if (activeProfile.regexRules && activeProfile.regexRules.length > 0) {
      for (const rule of activeProfile.regexRules) {
        const check = this.validateRegexPattern(rule.pattern);
        if (!check.valid) continue;

        try {
          const reg = new RegExp(rule.pattern, 'i');
          const match = combinedText.match(reg);
          if (match) {
            violations.push({
              matchedText: match[0],
              matchedRule: rule.name,
              severity: rule.action,
              reason: rule.reason || `Matched custom campaign regex pattern: "${rule.pattern}".`,
              suggestedAction: rule.suggestedAction || `Revise phrasing around "${match[0]}" to comply with campaign guidelines.`
            });
          }
        } catch {
          // ignore corrupted rule
        }
      }
    }

    // 4. Required terms check (if configured)
    if (activeProfile.requiredTerms && activeProfile.requiredTerms.length > 0) {
      for (const req of activeProfile.requiredTerms) {
        if (!combinedText.includes(req.toLowerCase())) {
          violations.push({
            matchedText: req,
            matchedRule: `Missing required advisory term: "${req}"`,
            severity: 'WARNING',
            reason: `Campaign profile expects mandatory disclosure or phrase "${req}".`,
            suggestedAction: `Consider adding overlay banner or caption disclaimer with "${req}".`
          });
        }
      }
    }

    // Determine overall status
    let status: 'PASS' | 'WARNING' | 'BLOCK' = 'PASS';
    if (violations.some((v) => v.severity === 'BLOCK')) {
      status = 'BLOCK';
    } else if (violations.length > 0) {
      status = 'WARNING';
    }

    return {
      status,
      violations
    };
  }
}

