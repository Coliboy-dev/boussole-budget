import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Confidentialité · Boussole Budget' };

export default function PrivacyPage() {
  return (
    <article className="space-y-4 px-4 py-4 text-sm leading-relaxed text-gray-700">
      <h1 className="text-xl font-bold text-gray-900">Confidentialité</h1>

      <section className="space-y-2">
        <h2 className="font-semibold text-gray-900">Données de ton budget</h2>
        <p>
          Le prénom, le solde, les revenus, les charges et les autres données que tu saisis sont enregistrés
          dans ton navigateur ou dans l’application installée. Le calcul et la restauration de sauvegarde se
          font sur ton appareil. Boussole Budget ne transmet pas ton budget à un serveur.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-gray-900">Accès et effacement</h2>
        <p>
          Tu peux consulter et modifier tes données dans l’application, télécharger une copie JSON dans
          Sauvegarde, ou les effacer dans Réglages. Les données restent dans le navigateur jusqu’à leur
          effacement. Les sauvegardes téléchargées restent dans le dossier où tu les as enregistrées.
        </p>
        <p>
          La sauvegarde JSON contient tes données financières en clair. Garde-la dans un endroit auquel
          toi seul ou les personnes que tu autorises ont accès.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-gray-900">Fonctionnement hors ligne</h2>
        <p>
          Le navigateur garde une copie des pages et des ressources de l’application pour pouvoir les ouvrir
          sans réseau. Ce cache ne contient pas les données de ton budget. Boussole Budget n’utilise ni cookie
          publicitaire ni outil de mesure d’audience. L’hébergement peut produire des journaux techniques lors
          des visites en ligne.
        </p>
      </section>
    </article>
  );
}
