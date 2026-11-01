// THE HOLLOWDEEP — Party members
// EOB-style: you run all four. HeroQuest mirrors noted per member.

export interface Ability {
  id: string;
  name: string;
  description: string;
  cost?: string; // resource cost, if any
}

export interface PartyMember {
  id: string;
  name: string;
  epithet: string;
  archetype: string;
  heroquestMirror: string;
  backstory: string;
  stats: {
    hp: number;
    attack: number; // base attack dice
    defend: number; // base defend dice
    mind: number; // spell power / will
    move: number; // squares per turn
  };
  abilities: Ability[];
  barks: string[]; // in-combat / exploration voice lines
}

export const party: PartyMember[] = [
  {
    id: 'sera',
    name: 'Sera Voss',
    epithet: 'the Disgraced Cartographer',
    archetype: 'Scout',
    heroquestMirror: 'Elf',
    backstory:
      'Charted three expeditions into the Hollowdeep for the Guild. All three maps were perfect. All three were wrong by morning — the labyrinth rearranges itself nightly, and the Guild blamed her anyway. She came back down to prove the maps were never the problem.',
    stats: { hp: 10, attack: 2, defend: 2, mind: 3, move: 4 },
    abilities: [
      {
        id: 'keen-search',
        name: 'Keen Search',
        description: 'Search a room twice; keep the better result. Finds traps others miss.',
      },
      {
        id: 'backstab',
        name: 'Backstab',
        description: 'Double damage when attacking a monster engaged with another party member.',
      },
    ],
    barks: [
      'That wall moved. I know walls. That one moved.',
      'My maps were right. The dungeon cheats.',
      'Trap. Obviously. You’re welcome.',
    ],
  },
  {
    id: 'anselm',
    name: 'Brother Anselm',
    epithet: 'the Answered Priest',
    archetype: 'Healer',
    heroquestMirror: '—',
    backstory:
      'A priest of the Quiet God who tended the shrine at the Hollowdeep’s sealed gate for eleven years. Then his prayers started getting answered — by something down below, in a voice like grinding stone. He descended to ask it what it wants.',
    stats: { hp: 12, attack: 1, defend: 3, mind: 5, move: 2 },
    abilities: [
      {
        id: 'lay-hands',
        name: 'Lay Hands',
        description: 'Restore 4 HP to an adjacent party member.',
        cost: '1 favor',
      },
      {
        id: 'answered-prayer',
        name: 'Answered Prayer',
        description:
          'Roll on the wild table: the thing below may heal, harm, or do something stranger. High risk, high reward.',
        cost: '1 favor',
      },
    ],
    barks: [
      'Something down here heard me. It’s still listening.',
      'Hold still. This will either heal you or… hold still.',
      'My god is quiet. The other one is not.',
    ],
  },
  {
    id: 'dagna',
    name: 'Dagna Ironhold',
    epithet: 'the Doorlistener',
    archetype: 'Tank',
    heroquestMirror: 'Dwarf',
    backstory:
      'Dwarven siege-breaker hired for muscle. Claims doors talk to her — which way they swing, what’s behind them, whether they’re lying. Nobody believes her. She has never been wrong about a door.',
    stats: { hp: 18, attack: 3, defend: 4, mind: 1, move: 2 },
    abilities: [
      {
        id: 'shield-wall',
        name: 'Shield Wall',
        description: 'Take all attacks aimed at adjacent party members this round. Defense doubled.',
      },
      {
        id: 'door-sense',
        name: 'Door Sense',
        description: 'Dagna hears doors: reveals what lies beyond sealed doors on the current floor.',
      },
    ],
    barks: [
      'This door says there’s treasure. This door is a liar. We’re going through anyway.',
      'Stand behind me. That’s what I’m for.',
      'I’ve broken forty-seven doors. This one’s forty-eight.',
    ],
  },
  {
    id: 'nameless',
    name: 'The Nameless',
    epithet: 'the Masked Arcanist',
    archetype: 'Mage',
    heroquestMirror: 'Wizard',
    backstory:
      'Joined the expedition at the gate, masked, uninvited, and carrying Guild papers that check out but feel wrong. Speaks rarely. Knows things about the Hollowdeep no living cartographer should know. Will not say why they came.',
    stats: { hp: 8, attack: 1, defend: 1, mind: 6, move: 3 },
    abilities: [
      {
        id: 'hollow-bolt',
        name: 'Hollow Bolt',
        description: 'Ranged mind attack. Damage scales with Mind. Ignores armor.',
      },
      {
        id: 'unmask',
        name: 'Unmask',
        description:
          'Once per descent: reveal a hidden truth about the current floor — secret rooms, the Warden’s location, or a fragment of the Nameless’s own past.',
      },
    ],
    barks: [
      '…',
      'I have been here before. Not in this body.',
      'The labyrinth dreams. I intend to wake it politely.',
    ],
  },
];
