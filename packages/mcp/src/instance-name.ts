// Readable per-process names, so two agent sessions on one machine can tell
// their bridges apart ("I am wooden-quiet-otter, this tab says brisk-amber-kite").
//
// Word lists are bundled rather than pulled from a package: this server is
// deliberately thin on dependencies, and the lists only need to be large enough
// that a collision between two live sessions is unlikely. They are also picked
// to stay unambiguous when spoken or typed — no homophones, no near-identical
// pairs, nothing that needs spelling out.

const ADJECTIVES = [
  "amber",
  "ancient",
  "brave",
  "brisk",
  "bronze",
  "calm",
  "clever",
  "copper",
  "crimson",
  "curious",
  "dusty",
  "eager",
  "eastern",
  "electric",
  "frosty",
  "gentle",
  "golden",
  "hidden",
  "hollow",
  "humble",
  "ivory",
  "jolly",
  "lucky",
  "marble",
  "mellow",
  "misty",
  "northern",
  "olive",
  "patient",
  "polished",
  "quiet",
  "rapid",
  "restless",
  "rugged",
  "rustic",
  "scarlet",
  "silent",
  "silver",
  "sleepy",
  "solid",
  "spotted",
  "steady",
  "sturdy",
  "sunny",
  "tidy",
  "velvet",
  "wandering",
  "wooden",
];

const NOUNS = [
  "anchor",
  "badger",
  "beacon",
  "bison",
  "bramble",
  "canyon",
  "cedar",
  "comet",
  "compass",
  "cricket",
  "dolphin",
  "ember",
  "falcon",
  "ferret",
  "garden",
  "glacier",
  "harbor",
  "heron",
  "island",
  "jasmine",
  "kestrel",
  "kite",
  "lantern",
  "lemur",
  "lighthouse",
  "marmot",
  "meadow",
  "monsoon",
  "narwhal",
  "orchard",
  "otter",
  "pebble",
  "pelican",
  "prairie",
  "quarry",
  "raven",
  "ridge",
  "salmon",
  "sparrow",
  "tadpole",
  "thicket",
  "tundra",
  "vulture",
  "walrus",
  "willow",
  "wombat",
  "yarrow",
  "zebra",
];

function pickIndex(list: unknown[]): number {
  return Math.floor(Math.random() * list.length);
}

/** e.g. "sleepy-bronze-tadpole". ~100k combinations, fresh on every start. */
export function generateInstanceName(): string {
  const first = pickIndex(ADJECTIVES);
  // Offset rather than re-roll, so the two adjectives are always different
  // ("quiet-quiet-otter" reads like a stutter) without an unbounded loop.
  const second =
    (first + 1 + Math.floor(Math.random() * (ADJECTIVES.length - 1))) % ADJECTIVES.length;
  return `${ADJECTIVES[first]}-${ADJECTIVES[second]}-${NOUNS[pickIndex(NOUNS)]}`;
}
