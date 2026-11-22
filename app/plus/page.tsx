'use client';

import SectionLinks from '@/components/layout/SectionLinks';
import { OfflineStatus } from '@/components/layout/OfflineSupport';
import Card from '@/components/ui/Card';
import { useHouseholdWorkspace } from '@/components/household/HouseholdWorkspace';
import { householdCopy } from '@/lib/household-copy';

const moreLinks = [
  { href: '/foyer', label: householdCopy.household },
  { href: '/reglages', label: 'Réglages' },
  { href: '/conseils', label: 'Conseils' },
  { href: '/synchronisation', label: 'Compte et sécurité' },
  { href: '/sauvegarde', label: 'Sauvegarder ou restaurer' },
  { href: '/demo', label: 'Budget de démonstration' },
  { href: '/confidentialite', label: 'Confidentialité' },
  { href: '/mentions-legales', label: 'Mentions légales' },
];

export default function MorePage() {
  const { active: household } = useHouseholdWorkspace();
  const links = household ? moreLinks.filter(({ href }) => href !== '/conseils' && href !== '/sauvegarde' && href !== '/reglages') : moreLinks;
  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="text-xl font-bold text-gray-900">Plus</h1>
      <SectionLinks links={links} />
      <Card className="space-y-2 text-sm text-gray-700">
        <h2 className="font-semibold text-gray-900">Installer Boussole</h2>
        <p>Sur iPhone, ouvre le menu Partager de Safari, puis « Sur l’écran d’accueil ».</p>
        <p>Sur Android, ouvre le menu de Chrome, puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».</p>
        <OfflineStatus />
      </Card>
    </div>
  );
}
