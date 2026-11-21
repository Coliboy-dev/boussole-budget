import SectionLinks from '@/components/layout/SectionLinks';
import { OfflineStatus } from '@/components/layout/OfflineSupport';
import Card from '@/components/ui/Card';

const moreLinks = [
  { href: '/reglages', label: 'Réglages' },
  { href: '/conseils', label: 'Conseils' },
  { href: '/synchronisation', label: 'Compte et sécurité' },
  { href: '/sauvegarde', label: 'Sauvegarder ou restaurer' },
  { href: '/demo', label: 'Budget de démonstration' },
  { href: '/confidentialite', label: 'Confidentialité' },
  { href: '/mentions-legales', label: 'Mentions légales' },
];

export default function MorePage() {
  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="text-xl font-bold text-gray-900">Plus</h1>
      <SectionLinks links={moreLinks} />
      <Card className="space-y-2 text-sm text-gray-700">
        <h2 className="font-semibold text-gray-900">Installer Boussole</h2>
        <p>Sur iPhone, ouvre le menu Partager de Safari, puis « Sur l’écran d’accueil ».</p>
        <p>Sur Android, ouvre le menu de Chrome, puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».</p>
        <OfflineStatus />
      </Card>
    </div>
  );
}
