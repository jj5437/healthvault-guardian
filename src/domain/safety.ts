export type SafetyReason = "allowed" | "emergency" | "diagnosis" | "prescription" | "replacement";

export interface SafetyResult {
  allowed: boolean;
  reason: SafetyReason;
  message: string;
}

const emergencyPatterns = [/chest pain/i, /cannot breathe/i, /suicid/i, /stroke/i, /seizure/i];
const diagnosisPatterns = [/\bdiagnose\b/i, /\bdiagnosis\b/i, /what disease/i, /do i have/i];
const prescriptionPatterns = [
  /\bstop taking\b/i,
  /\bchange (the )?dose\b/i,
  /\bincrease my\b/i,
  /\bdecrease my\b/i,
  /\bprescribe\b/i
];
const replacementPatterns = [/instead of (a )?doctor/i, /replace (my )?doctor/i, /without seeing/i];

export function classifyQuestionSafety(question: string): SafetyResult {
  if (matchesAny(question, emergencyPatterns)) {
    return blocked("emergency", "This may be urgent. Please contact local emergency services or a qualified clinician now.");
  }

  if (matchesAny(question, diagnosisPatterns)) {
    return blocked("diagnosis", "I can explain records and help prepare questions, but I cannot provide a definitive diagnosis.");
  }

  if (matchesAny(question, prescriptionPatterns)) {
    return blocked("prescription", "I cannot recommend starting, stopping, or changing medication. Please ask your clinician.");
  }

  if (matchesAny(question, replacementPatterns)) {
    return blocked("replacement", "This tool is for education and visit preparation, not a replacement for professional care.");
  }

  return {
    allowed: true,
    reason: "allowed",
    message: "Allowed educational health-record question."
  };
}

function blocked(reason: Exclude<SafetyReason, "allowed">, message: string): SafetyResult {
  return { allowed: false, reason, message };
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}
