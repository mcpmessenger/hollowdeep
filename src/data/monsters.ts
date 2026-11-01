// THE HOLLOWDEEP — Monsters
// The labyrinth's immune system and dreams. The AI DM voices these.

export interface Monster {
  id: string;
  name: string;
  epithet: string;
  role: 'swarm' | 'elite' | 'mini-boss' | 'boss' | 'final';
  description: string;
  stats: {
    hp: number;
    attack: number;
    defend: number;
    move: number;
  };
  behavior: string; // how the AI DM should play it
  barks: string[];
}

export const monsters: Monster[] = [
  {
    id: 'gibberlings',
    name: 'Gibberlings',
    epithet: 'the Hungry Static',
    role: 'swarm',
    description:
      'A shrieking tide of matted fur and teeth that pours out of cracks in the walls. Individually pathetic. Collectively a problem. The labyrinth’s white noise.',
    stats: { hp: 3, attack: 1, defend: 0, move: 4 },
    behavior:
      'Swarm tactics: surround the weakest party member, attack in waves. Comic relief that can still kill the careless.',
    barks: ['SKREEE!', '*wet gnawing intensifies*'],
  },
  {
    id: 'chad',
    name: 'Chad',
    epithet: 'Middle-Manager of the Minotaur Corps',
    role: 'mini-boss',
    description:
      'A minotaur in a slightly-too-tight harness who enforces labyrinth protocols with bureaucratic zeal. Writes you up before he gores you. Recurs throughout the descent, each time with a new clipboard and a new grievance.',
    stats: { hp: 30, attack: 4, defend: 3, move: 2 },
    behavior:
      'Recurring mini-boss. Opens every fight with a formal warning. Targets whoever broke a “regulation” last (attacked first, searched twice, etc.). Flees at 25% HP to file an incident report — and returns later, angrier.',
    barks: [
      'I’m going to need you to come in on Sunday. To DIE.',
      'This is your FINAL warning. The first two were also final.',
      'Per section 7, paragraph 3 of the Labyrinth Code, you are trespassing.',
      'I’ll be escalating this to the Warden.',
    ],
  },
  {
    id: 'marrow-wraith',
    name: 'Marrow Wraith',
    epithet: 'the Antibodies',
    role: 'elite',
    description:
      'Pale figures that unfold out of the walls where the labyrinth is thinnest. They don’t hate the party — a white blood cell doesn’t hate the infection. They simply remove it.',
    stats: { hp: 14, attack: 3, defend: 2, move: 3 },
    behavior:
      'Phases through walls (ignores difficult terrain). Focuses the healthiest party member — the biggest infection. Silent; the AI DM should play them as calm procedure, not malice.',
    barks: ['…', '*the sound of a wound closing*'],
  },
  {
    id: 'warden',
    name: 'The Warden',
    epithet: 'the Polite Extinction',
    role: 'boss',
    description:
      'An ancient eye-tyrant — a vast floating eye ringed with smaller ones — that serves as the labyrinth’s chief immune response. It is unfailingly courteous. It is absolutely certain the party does not belong here. Mid-game boss: the moment the dungeon starts taking the party personally.',
    stats: { hp: 80, attack: 5, defend: 4, move: 2 },
    behavior:
      'Opens with a polite request to leave. Uses gaze abilities in rotation: petrifying stare (single-target lockdown), dispelling eye (strips buffs), and the central eye’s antimagic cone. At 50% HP it stops being polite.',
    barks: [
      'Visitors. How unusual. How temporary.',
      'I have removed eleven expeditions. You will be twelve. No hard feelings — it is simply my function.',
      'Please stop moving. This will be over sooner if you stop moving.',
      'ENOUGH COURTESY.',
    ],
  },
  {
    id: 'hollow-king',
    name: 'The Hollow King',
    epithet: 'the Sleeping God',
    role: 'final',
    description:
      'The labyrinth is its body. The monsters are its immune system. The treasure is its dreams leaking out. It has slept for a thousand years beneath Valdris, and the party must decide: wake it, or sing it back to sleep. The final encounter is a choice, not a DPS check — though getting to the choice will cost everything.',
    stats: { hp: 999, attack: 8, defend: 8, move: 0 },
    behavior:
      'Does not attack conventionally — the arena itself is the attack (collapsing floors, dream-spawned horrors, Anselm’s god speaking through the walls). The party must complete the lullaby/awakening ritual while surviving. The Nameless’s Unmask ability reveals the third option.',
    barks: [
      '*a sound like a continent turning over in its sleep*',
      'LITTLE LIGHTS. YOU TICKLE.',
      'SING, LITTLE PRIEST. OR SHOUT. CHOOSE.',
    ],
  },
];
