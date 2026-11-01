# THE HOLLOWDEEP — Product Requirements Document

## Logline
A modern first-person dungeon crawler. Lead a party of four into a living labyrinth beneath the city of Valdris — a dungeon that rearranges itself nightly, run by an AI dungeon master playing the role of Zargon. Find the heart. Make the choice.

## Inspirations
- **Eye of the Beholder** — first-person grid movement, real-time monster encounters, party of four.
- **HeroQuest** — archetypal heroes, the Search action, one evil mastermind running the dungeon against the party.
- **Greek myth** — the labyrinth, the minotaur, Ariadne's thread (save system).

## Pillars
1. **The dungeon is alive.** It rearranges, reacts, and remembers. No two descents are identical.
2. **The AI is Zargon.** An AI dungeon master narrates rooms, voices monsters, and adapts encounters — the evil wizard role, automated.
3. **Every room is a decision.** Move, Search, Fight, or Flee — the HeroQuest verbs, modernized.
4. **Proof over grind.** Combat rewards smart play (positioning, Search intel, ability combos), not stat inflation.

## Story (3 acts)
- **Act 1 — Descent:** The flow from the Hollowdeep has stopped. The Guild's last expedition never returned. The party descends to find out why and learns the labyrinth is the gut of a sleeping god.
- **Act 2 — The Warden:** The labyrinth's immune system notices the party. The Warden — an ancient, polite eye-tyrant — begins hunting them personally.
- **Act 3 — The Hollow King:** The party reaches the heart and must choose: wake the sleeping god (and doom Valdris?) or sing it back to sleep (Anselm's arc).

## Characters
Defined in `src/data/`:
- `party.ts` — Sera Voss (scout), Brother Anselm (healer), Dagna Ironhold (tank), The Nameless (mage)
- `monsters.ts` — Chad (recurring mini-boss), Gibberlings, Marrow Wraiths, The Warden (mid-boss), The Hollow King (final)
- `npcs.ts` — Guildmaster Pell, Nia (thread-seller / save points)

## Core loop
1. Enter a procedurally generated dungeon floor (grid-based, first-person).
2. Explore room by room: **Move / Search / Fight / Flee**.
3. Search reveals treasure, traps, and lore; fighting costs resources; fleeing costs progress.
4. Descend. The dungeon adapts to your playstyle via the AI DM.
5. Boss encounters at act breaks. The final choice ends the run — then new game+ with a rearranged deep.

## Systems
- **Movement:** grid-based, first-person, WASD + arrows + mouse-look. (The old game's bug: WASD unbound, silent init failures — not repeating that.)
- **Combat:** real-time-with-pause, party of four, positioning matters. Attack / Defend / ability per member.
- **Search:** the HeroQuest verb — each room can be searched once for treasure, traps, or secrets. Sera gets a bonus.
- **AI Dungeon Master:** narrates room entries, voices monster barks, adjusts encounter difficulty. Runs local-first with API fallback.
- **Thread (saves):** Nia's thread marks waypoints. Limited thread per descent — saving is a resource.
- **Permadeath (optional):** classic mode per-run; story mode keeps progress.

## Tech (proposed)
- Web-first: Vite + TypeScript + Three.js for the first-person view.
- Character/world data as typed TS modules (this repo).
- AI DM: pluggable — local stub first, API (Claude/Gemini) later.
- Target: playable in browser, no install.

## Milestones
1. **Vertical slice:** one floor, grid movement, one monster type (Gibberlings), Search, HUD. Playable.
2. **Party + combat:** all four members, abilities, Warden encounter.
3. **AI DM v1:** narration + adaptive encounters.
4. **Acts 2–3:** full story, Hollow King choice, new game+.

## Non-goals (for now)
- Multiplayer. Mobile-first. Full voice acting.
