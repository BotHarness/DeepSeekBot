export const ONBOARDING_PERSONAS = ['engineer', 'creator', 'operator', 'learner'] as const;
export type OnboardingPersona = (typeof ONBOARDING_PERSONAS)[number];

export const ONBOARDING_FEATURES = ['bot', 'group', 'schedule', 'browser', 'memory', 'im'] as const;
export type OnboardingFeature = (typeof ONBOARDING_FEATURES)[number];

export type PersonaPrompt = { id: string; feature: OnboardingFeature };

export const PERSONA_TEMPLATES: Readonly<
  Record<OnboardingPersona, { icon: string; prompts: readonly PersonaPrompt[] }>
> = {
  engineer: {
    icon: 'terminal',
    prompts: [
      { id: 'reviewer', feature: 'bot' },
      { id: 'squad', feature: 'group' },
      { id: 'releases', feature: 'schedule' },
    ],
  },
  creator: {
    icon: 'tv',
    prompts: [
      { id: 'trends', feature: 'browser' },
      { id: 'editor', feature: 'bot' },
      { id: 'brief', feature: 'schedule' },
    ],
  },
  operator: {
    icon: 'briefcase',
    prompts: [
      { id: 'team', feature: 'group' },
      { id: 'im', feature: 'im' },
      { id: 'weekly', feature: 'schedule' },
    ],
  },
  learner: {
    icon: 'book-open',
    prompts: [
      { id: 'tutor', feature: 'bot' },
      { id: 'papers', feature: 'browser' },
      { id: 'goals', feature: 'memory' },
    ],
  },
};

export function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
