import SectionLinks from '@/components/layout/SectionLinks';

const moreLinks = [
  { href: '/reglages', label: 'Réglages' },
  { href: '/conseils', label: 'Conseils' },
  { href: '/sauvegarde', label: 'Sauvegarder ou restaurer' },
  { href: '/demo', label: 'Budget de démonstration' },
];

export default function MorePage() {
  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="text-xl font-bold text-gray-900">Plus</h1>
      <SectionLinks links={moreLinks} />
    </div>
  );
}
