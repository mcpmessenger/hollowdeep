// THE HOLLOWDEEP — NPCs

export interface Npc {
  id: string;
  name: string;
  epithet: string;
  description: string;
  function: string; // gameplay purpose
  barks: string[];
}

export const npcs: Npc[] = [
  {
    id: 'pell',
    name: 'Guildmaster Pell',
    epithet: 'the One Who Sends',
    description:
      'Head of the Valdris Guild. Funded the expedition, wrote the contracts, and knows considerably more about the Hollowdeep than she has told anyone. Every answer she gives opens two new questions.',
    function:
      'Quest-giver and patron. Appears between descents; her dialogue foreshadows the Hollow King reveal.',
    barks: [
      'The last expedition was… thorough. Try to be thorough in the other direction. Come back.',
      'The flow stopped on a Tuesday. Everything important happens on Tuesdays.',
      'If you find the heart — and you will — remember who paid for the rope.',
    ],
  },
  {
    id: 'nia',
    name: 'Nia',
    epithet: 'the Thread-Seller',
    description:
      'A street urchin who somehow gets into the Hollowdeep ahead of every expedition and sells “thread” — silk cord that marks a safe waypoint. Ariadne’s thread, monetized. Nobody knows how she gets in. She won’t explain. She’s twelve.',
    function:
      'Save system: thread marks waypoints (save points). Limited thread per descent — saving is a resource.',
    barks: [
      'Thread! Genuine labyrinth thread! Doesn’t tangle, doesn’t snap, definitely not cursed.',
      'You want to remember where you’ve been? That’ll cost you. Forgetting’s free.',
      'My gran sold thread to the last expedition too. They tipped well. They’re dead.',
    ],
  },
];
