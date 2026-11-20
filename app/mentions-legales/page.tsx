import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Mentions légales · Boussole Budget' };

export default function LegalPage() {
  return (
    <article className="space-y-4 px-4 py-4 text-sm leading-relaxed text-gray-700">
      <h1 className="text-xl font-bold text-gray-900">Mentions légales</h1>

      <section className="space-y-2">
        <h2 className="font-semibold text-gray-900">Éditeur</h2>
        <p>
          Le droit belge s’applique à Boussole Budget. Les renseignements sur l’éditeur relèvent de
          l’article XII.6 du Code de droit économique.
        </p>
        <dl className="space-y-2">
          <div>
            <dt className="font-medium text-gray-900">Dénomination</dt>
            <dd>Start&apos;OnLab</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">Adresse</dt>
            <dd>Rue du Comté 79, 5140 Ligny, Belgique</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">E-mail de contact</dt>
            <dd>
              <a href="mailto:contact@startonlab.be" className="inline-flex min-h-11 items-center text-teal-800 underline">
                contact@startonlab.be
              </a>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">Numéro d’entreprise (BCE)</dt>
            <dd>1039.786.847</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">Numéro de TVA</dt>
            <dd>BE1039786847</dd>
          </div>
        </dl>
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
