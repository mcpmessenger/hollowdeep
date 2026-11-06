// Vess Holloway's journal — one page per depth, found by searching the
// bookshelf in her study (the Lair). Index = depth-1, clamped.

export const JOURNAL: string[] = [
  `DEPTH 1 — "The walls breathe when I press my ear to them. I have decided to love this place before it decides about me." — V.H.`,

  `DEPTH 2 — "Named the little ones today. Gibberlings — they smell you at six paces and their eyes catch torchlight like wet coal. Sera would laugh at my sketches." — V.H.`,

  `DEPTH 3 — "A minotaur in a waistcoat asked about my quarterly objectives. I played along. It keeps the teeth away. His name is Chad. I did not ask for this." — V.H.`,

  `DEPTH 4 — "Something enormous turned over in its sleep last night and the whole depth rearranged. The Guild calls it 'the Warden.' I call it an immune system. I am the infection." — V.H.`,

  `DEPTH 5 — "The Warden doesn't chase. It waits where I'm going. I've started leaving false trails — chalk marks that lie. Forgive me, whoever follows." — V.H.`,

  `DEPTH 6 — "My maps stopped matching the corridors three days ago. This morning they matched BEFORE I drew them. Read that again. I did." — V.H.`,

  `DEPTH 7 — "It isn't rearranging around me. It's dreaming my routes first, then building them. I am not exploring the Hollowdeep. I am being READ." — V.H.`,

  `DEPTH 8 — "Last night I dreamed a woman's face and woke to find handwriting I don't remember writing: 'YOU MAPPED ME. NOW I MAP YOU.' The ink was still wet." — V.H.`,

  `DEPTH 9 — "If you're reading this, the fire is still lit and I am not. Don't follow me down. The thing wearing my face knows every corridor I ever drew — because I taught it. Burn this page." — V.H.`,
];

/** Clamped lookup — depths beyond 9 repeat the last page. */
export function journalPage(depth: number): string {
  return JOURNAL[Math.min(Math.max(depth, 1), JOURNAL.length) - 1];
}

/** The Vale of First Light — granted with the sunpetal tonic, all three
 *  petals gathered. Vess found the dream-valley once, through a crack in
 *  her study floor, and left this page for whoever follows. */
export const VALE_PAGE = `THE VALE — "I found it once, by accident, through a crack in the study floor. Sunlight. Real sunlight, or the god's memory of it — gold grass, a stream, white ruins, and a clock in my head that finally ran FORWARD. Fifty years of wrong time, and up there it ticked true. The petals grow where the dream is thinnest. Take three and the dream will notice you — it forgets you the way a tide forgets a footprint. Don't linger. The valley is a kindness with a timer on it, and the god dreams in both directions." — V.H.`;
