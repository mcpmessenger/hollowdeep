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

// ---------------------------------------------------------------------------
// Vess's echo — press T inside her study. She answers contextually:
// the way down, her story, advice. Same overlay as Chad; the voiced lines
// live in audio/vess-*.mp3 (ElvenWizard whisper-voice).
// ---------------------------------------------------------------------------

export type VessChoiceId = 'exit' | 'story' | 'advice' | 'leave';

export const VESS_CHOICES: Array<{ id: VessChoiceId; label: string }> = [
  { id: 'exit', label: '"Where is the way down?"' },
  { id: 'story', label: '"What happened to you?"' },
  { id: 'advice', label: '"Any advice?"' },
  { id: 'leave', label: '"Leave her echo."' },
];

export const VESS_GREETINGS = [
  'Little cartographer... you walk my maps. Ask, and the echo answers.',
  'Another one, come down. The fire remembers you. Ask.',
];

export const VESS_EXIT_LINE = (dir: 'north' | 'south' | 'east' | 'west') =>
  `The way down breathes cold from the ${dir}. Follow it.`;

export const VESS_STORY = [
  'Fifty years I mapped. The walls breathed, and I loved them before they decided about me.',
  'The gibberlings were my first naming. Everything down here was unnamed — so I named it all.',
  'On the fourth depth I understood: the gut rearranges because the god dreams. I am its favorite dream.',
  'I stopped writing at nine. Not because I died, love. Because I arrived.',
];

export const VESS_ADVICE_LOWHP =
  'You bleed. My tonic waits on the table — take it, and go down whole.';

export const VESS_ADVICE_TIPS = [
  'Search the dead ends, love. The dungeon hides its kindness there.',
  'The wraiths smell you from nine cells off. Keep moving; never linger.',
  'Chad can be bought. Everyone down here has a price — his is twenty-five.',
  'The god dreams your routes before you walk them. Walk anyway.',
];

export const VESS_PARTING = [
  'Go. The god dreams, and I am its favorite dream.',
  'Down, little cartographer. Leave the fire lit.',
];

export const vessGreeting = () => pick(VESS_GREETINGS);
export const vessStory = () => pick(VESS_STORY);
export const vessAdviceTip = () => pick(VESS_ADVICE_TIPS);
export const vessParting = () => pick(VESS_PARTING);
