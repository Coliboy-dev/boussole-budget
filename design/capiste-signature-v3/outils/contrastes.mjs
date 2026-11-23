// Vérifie les contrastes WCAG des couleurs à rôle d’Élan V3 et écrit contrastes.md.
// Lancer : node design/capiste-signature-v3/outils/contrastes.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('..', import.meta.url);
const { tokens, charts } = JSON.parse(readFileSync(new URL('tokens.json', dir), 'utf8'));
const hex = (name) => tokens[name]?.value ?? name;

function luminance(color) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => {
  const [l1, l2] = [luminance(hex(a)), luminance(hex(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

// [premier plan, fond, seuil, usage]
const pairs = [
  ['text', 'background', 4.5, 'Texte principal sur ivoire'],
  ['text', 'surface', 4.5, 'Texte principal sur carte'],
  ['text-muted', 'background', 4.5, 'Texte secondaire sur ivoire'],
  ['text-muted', 'surface', 4.5, 'Texte secondaire sur carte'],
  ['text-muted', 'surface-soft', 4.5, 'Texte secondaire dans un encart'],
  ['on-primary', 'primary', 4.5, 'Texte du bouton principal'],
  ['on-primary', 'primary-strong', 4.5, 'Texte sur la carte du vrai disponible'],
  ['primary-text', 'background', 4.5, 'Lien teal sur ivoire'],
  ['primary-text', 'surface', 4.5, 'Lien teal sur carte'],
  ['primary-text', 'surface-soft', 4.5, 'Lien teal dans un encart'],
  ['secondary-text', 'surface', 4.5, 'Texte mauve sur carte'],
  ['secondary-text', 'secondary-soft', 4.5, 'Texte mauve dans un encart mauve'],
  ['warning-text', 'warning-soft', 4.5, 'Avertissement'],
  ['danger-text', 'surface', 4.5, 'Erreur ou montant négatif sur carte'],
  ['danger-text', 'danger-soft', 4.5, 'Erreur dans un encart'],
  ['success-text', 'surface', 4.5, 'Confirmation sur carte'],
  ['border-strong', 'surface', 3, 'Bordure de champ (élément d’interface)'],
  ['focus', 'surface', 3, 'Anneau de focus sur carte'],
  ['focus', 'background', 3, 'Anneau de focus sur ivoire'],
  ['secondary', 'surface', 3, 'Mauve graphique sur carte (élément non textuel)'],
  ['primary', 'surface', 3, 'Teal graphique sur carte (élément non textuel)'],
];

let failures = 0;
const rows = pairs.map(([fg, bg, min, usage]) => {
  const value = ratio(fg, bg);
  const ok = value >= min;
  if (!ok) failures++;
  return `| ${usage} | \`${fg}\` ${hex(fg)} | \`${bg}\` ${hex(bg)} | ${value.toFixed(2)}:1 | ${min}:1 | ${ok ? 'OK' : '**NON**'} |`;
});
// Parts de graphique adjacentes : au moins 3:1 contre la carte pour les teintes foncées, libellé obligatoire pour les claires.
const chartRows = ['scheduled', 'recorded'].flatMap((family) => charts[family].map((color) =>
  `| ${family === 'scheduled' ? 'Charges programmées' : 'Dépenses enregistrées'} | ${color} | ${ratio(color, '#FFFFFF').toFixed(2)}:1 |`));

writeFileSync(new URL('contrastes.md', dir), [
  '# Contrastes Élan V3 (thème clair)', '',
  'Généré par `outils/contrastes.mjs`. Seuils WCAG 2.2 AA : 4,5:1 pour le texte, 3:1 pour les éléments d’interface et les graphiques.', '',
  '| Usage | Premier plan | Fond | Contraste | Seuil | Résultat |', '| --- | --- | --- | --- | --- | --- |', ...rows, '',
  '## Couleurs des graphiques contre une carte blanche', '',
  'Les teintes sous 3:1 ne portent jamais seules une information : chaque part a son libellé et son montant à côté.', '',
  '| Famille | Couleur | Contraste |', '| --- | --- | --- |', ...chartRows, '',
].join('\n'));
console.log(failures ? `${failures} contraste(s) insuffisant(s)` : 'Tous les contrastes passent.');
process.exitCode = failures ? 1 : 0;
