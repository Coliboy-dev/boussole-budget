import type { SpendingCategory } from './types.ts';

const dictionary: Partial<Record<SpendingCategory, string[]>> = {
  groceries: [
    'colruyt', 'delhaize', 'aldi', 'lidl', 'carrefour', 'crf', 'intermarche', 'okay', 'spar', 'cora',
    'match', 'proxy', 'albert heijn', 'ecomarche', 'cadi', 'bio planet', 'louis delhaize',
  ],
  restaurants: ['quick', 'mcdonalds', 'mc donald', 'burger king', 'exki', 'panos', 'pizza hut', 'friterie', 'starbucks'],
  transport: [
    'stib', 'tec', 'sncb', 'nmbs', 'de lijn', 'total', 'totalenergies', 'q8', 'esso', 'shell',
    'lukoil', 'texaco', 'gulf', 'cambio', 'poppy',
  ],
  health: ['pharmacie', 'multipharma', 'apotheek'],
  clothing: ['primark', 'zara', 'kiabi', 'c a', 'h m', 'jbc', 'zeeman'],
  home: ['ikea', 'brico', 'hubo', 'gamma', 'action', 'hema', 'blokker', 'leroy'],
  leisure: ['kinepolis', 'decathlon', 'fnac', 'netflix', 'spotify', 'basic fit', 'jims'],
  pets: ['zooplus', 'tom co', 'maxi zoo', 'animalis', 'veterinaire', 'dierenarts'],
  beauty: ['ici paris', 'coiffeur', 'kapper', 'yves rocher', 'rituals'],
  travel: ['ryanair', 'brussels airlines', 'booking', 'airbnb', 'tui', 'flixbus'],
  cash: ['retrait', 'bancontact retrait', 'atm'],
};

const prefixes = Object.entries(dictionary).flatMap(([category, entries]) =>
  entries.map((prefix) => ({ prefix, category: category as SpendingCategory })),
).sort((a, b) => b.prefix.length - a.prefix.length);
const diacritics = new RegExp('\\p{M}', 'gu');
const separators = new RegExp('[^\\p{L}\\p{N}]+', 'gu');

function normalized(label: string): string {
  return label.toLowerCase().normalize('NFD').replace(diacritics, '').replace(separators, ' ').trim();
}

export function merchantKey(label: string): string {
  const words = normalized(label).split(' ');
  return [...words[0]].length >= 2 ? words[0] : words.slice(0, 2).join(' ');
}

export function suggestCategory(label: string, learned: Record<string, SpendingCategory>): SpendingCategory | undefined {
  const text = normalized(label);
  const key = merchantKey(text);
  if (key && Object.prototype.hasOwnProperty.call(learned, key)) return learned[key];
  return prefixes.find(({ prefix }) => text === prefix || text.startsWith(`${prefix} `))?.category;
}
