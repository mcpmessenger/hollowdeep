// Chad dialogue — press T near the middle-management minotaur to talk.
// No AI backend (yet): hand-written lines, real mechanical effects.
// The T-to-talk UI is built so a live ElevenLabs/OpenAI voice chat can
// take over this same overlay later.

export type ChadChoiceId = 'deal' | 'taunt' | 'leave';

export interface ChadChoice {
  id: ChadChoiceId;
  label: string;
}

export const CHAD_CHOICES: ChadChoice[] = [
  { id: 'deal', label: '"Let\'s make a deal."' },
  { id: 'taunt', label: '"You fight like you file TPS reports."' },
  { id: 'leave', label: '"Walk away."' },
];

export const DEAL_PRICE = 25; // gold
export const DEAL_DURATION_MS = 45000; // pacified: won't chase or bite
export const ENRAGE_DURATION_MS = 25000; // enraged: bites faster, takes +1 dmg

export const CHAD_GREETINGS = [
  'Ah. Another adventurer. Do you have an appointment? Or are you just... wandering?',
  'This corridor is a designated synergy space. State your business.',
  'You look lost. HR gets a lot of you people down here.',
];

export const CHAD_DEAL_ACCEPT = [
  "Pleasure doing business. Forty-five seconds on the calendar. Don't bleed on the carpet.",
  'Fine. Invoice paid. I will not bite — that would be billable.',
];

export const CHAD_DEAL_MOCK = [
  "Twenty-five gold. You can't even afford me. Back to the maze, intern.",
  'Hah. Your coin pouch just filed for bankruptcy.',
];

export const CHAD_TAUNT_BACK = [
  "Oh, it's ON. I'm CC'ing the Hollow King on your performance review!",
  'TPS reports?! I INVENTED the TPS report. You are done here.',
];

export const CHAD_PARTING = [
  "We're done here. My door is always open — it's a labyrinth, everything is open.",
  'Run along. I have a one-on-one with the Minotaur at four.',
];

/** Extra wind-up barks while Chad is enraged. */
export const CHAD_ENRAGED_BARKS = [
  'PER MY LAST EMAIL —',
  'This is going on your permanent record!',
  'Chad has escalated to upper management (his horns).',
];

const pick = <T>(arr: T[]): T => arr[(Math.random() * arr.length) | 0];

export const chadGreeting = () => pick(CHAD_GREETINGS);
export const chadDealAccept = () => pick(CHAD_DEAL_ACCEPT);
export const chadDealMock = () => pick(CHAD_DEAL_MOCK);
export const chadTauntBack = () => pick(CHAD_TAUNT_BACK);
export const chadParting = () => pick(CHAD_PARTING);
export const chadEnragedBark = () => pick(CHAD_ENRAGED_BARKS);
