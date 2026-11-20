import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Mentions légales · Boussole Budget' };

export default function LegalPage() {
  return (
    <article className="space-y-4 px-4 py-4 text-sm leading-relaxed text-gray-700">
      <h1 className="text-xl font-bold text-gray-900">Mentions légales</h1>

      <section className="space-y-2">
        <h2 className="font-semibold text-gray-900">Éditeur et hébergement</h2>
        <p>
          Les coordonnées de l’éditeur, du responsable de publication et de l’hébergeur
          seront renseignées avant l’ouverture de Boussole Budget au public.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-gray-900">Utilisation du service</h2>
        <p>
          Boussole Budget est un outil de suivi budgétaire. Les projections dépendent des montants et des
          dates que tu saisis. Pour une décision concernant tes dettes ou tes droits, prends conseil
          auprès d’un service compétent.
        </p>
      </section>
    </article>
  );
}
