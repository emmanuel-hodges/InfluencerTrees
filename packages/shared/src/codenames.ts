// Codename generator: Adjective Animal, from curated family-friendly lists.
// Uniqueness is enforced by the API when a codename is saved; the generator
// only draws candidates.

export const ADJECTIVES: readonly string[] = [
  'Amber', 'Azure', 'Bold', 'Brave', 'Bright', 'Brisk', 'Calm', 'Candid', 'Cedar', 'Clever',
  'Cobalt', 'Copper', 'Coral', 'Crimson', 'Crisp', 'Daring', 'Dawn', 'Eager', 'Early', 'Ember',
  'Fair', 'Fleet', 'Frank', 'Gentle', 'Gilded', 'Glad', 'Golden', 'Granite', 'Hardy', 'Hazel',
  'Honest', 'Humble', 'Indigo', 'Ivory', 'Jade', 'Jolly', 'Keen', 'Kind', 'Lively', 'Loyal',
  'Lucky', 'Maple', 'Merry', 'Mighty', 'Misty', 'Modest', 'Noble', 'Nimble', 'Olive', 'Onyx',
  'Opal', 'Patient', 'Pearl', 'Plucky', 'Proud', 'Quick', 'Quiet', 'Rapid', 'Ruby', 'Rustic',
  'Sable', 'Saffron', 'Sage', 'Scarlet', 'Silver', 'Sincere', 'Snowy', 'Steady', 'Sturdy', 'Sunny',
  'Swift', 'Tawny', 'Tidy', 'Timber', 'Topaz', 'Trusty', 'Velvet', 'Vivid', 'Wise', 'Witty',
];

export const ANIMALS: readonly string[] = [
  'Albatross', 'Antelope', 'Badger', 'Beaver', 'Bison', 'Bobcat', 'Bulldog', 'Caribou', 'Cardinal', 'Cheetah',
  'Cobra', 'Condor', 'Cougar', 'Coyote', 'Crane', 'Dolphin', 'Eagle', 'Egret', 'Elk', 'Falcon',
  'Ferret', 'Finch', 'Fox', 'Gannet', 'Gazelle', 'Gecko', 'Gopher', 'Heron', 'Hornet', 'Ibex',
  'Iguana', 'Jaguar', 'Kestrel', 'Kingfisher', 'Koala', 'Lark', 'Lemur', 'Leopard', 'Lynx', 'Magpie',
  'Manatee', 'Marlin', 'Marten', 'Meerkat', 'Moose', 'Narwhal', 'Newt', 'Ocelot', 'Orca', 'Osprey',
  'Otter', 'Owl', 'Panda', 'Panther', 'Pelican', 'Penguin', 'Pika', 'Puffin', 'Quail', 'Rabbit',
  'Raven', 'Robin', 'Salmon', 'Sandpiper', 'Seal', 'Sparrow', 'Stag', 'Starling', 'Stork', 'Swan',
  'Swift', 'Tapir', 'Tern', 'Tortoise', 'Toucan', 'Trout', 'Walrus', 'Wombat', 'Wren', 'Yak',
];

export const CODENAME_PATTERN = /^[A-Z][a-z]+ [A-Z][a-z]+( \d{2})?$/;

/**
 * Draws a codename. Pass withSuffix to append two digits, which the API does
 * after a collision so the second draw is almost certainly free.
 */
export function generateCodename(randomInt: (maxExclusive: number) => number, withSuffix = false): string {
  const a = ADJECTIVES[randomInt(ADJECTIVES.length)];
  const n = ANIMALS[randomInt(ANIMALS.length)];
  const base = `${a} ${n}`;
  if (!withSuffix) return base;
  return `${base} ${String(randomInt(100)).padStart(2, '0')}`;
}

export function normalizeCodename(codename: string): string {
  return codename.trim().replace(/\s+/g, ' ').toLowerCase();
}
