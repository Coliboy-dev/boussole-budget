import SectionLinks from '@/components/layout/SectionLinks';

const budgetLinks = [
  { href: '/revenus', label: 'Revenus' },
  { href: '/charges', label: 'Charges' },
  { href: '/dettes', label: 'Dettes' },
  { href: '/enfants', label: 'Frais des enfants' },
  { href: '/objectifs', label: 'Objectifs' },
];

export default function BudgetPage() {
  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="text-xl font-bold text-gray-900">Budget</h1>
      <SectionLinks links={budgetLinks} />
    </div>
  );
}
