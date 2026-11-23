import type { Metadata } from 'next';
import { managedBackupsEnabled } from '@/lib/cloud-remote';
import { householdEnabled } from '@/lib/household-feature';

export const metadata: Metadata = { title: 'Confidentialité · Capiste' };

export default function PrivacyPage() {
  return (
    <article className="space-y-4 px-4 py-4 text-sm leading-relaxed text-gray-700">
      <h1 className="text-xl font-bold text-gray-900">Confidentialité</h1>

      <section className="space-y-2">
        <h2 className="font-semibold text-gray-900">Données de ton budget</h2>
        <p>
          Le prénom, le solde, les revenus, les charges et les autres données que tu saisis sont enregistrés
          dans ton navigateur ou dans l’application installée. Le calcul et la restauration de sauvegarde se
          font sur ton appareil.
          {!managedBackupsEnabled && ' Sans synchronisation, Capiste ne transmet pas ton budget à un serveur.'}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-gray-900">{managedBackupsEnabled ? 'Sauvegarde en ligne et synchronisation' : 'Synchronisation entre appareils (facultative)'}</h2>
        {managedBackupsEnabled ? (
          <>
            <p>Quand tu crées ton budget avec un compte, une copie chiffrée est sauvegardée automatiquement chez Supabase, notre sous-traitant d’hébergement de base de données en Irlande. Tes modifications sont envoyées à chaque synchronisation.</p>
            <p>Start’OnLab gère les clés des nouvelles copies. Le service peut déchiffrer ta copie pour te la restituer après que tu t’es connecté avec ton mot de passe, ou avec un code reçu par e-mail si tu l’as oublié. Les anciennes copies protégées par une phrase secrète gardent ce mode de récupération.</p>
            <p>
              Toute personne qui connaît ton mot de passe, ou qui a accès à ta boîte e-mail, peut ouvrir ta copie en ligne
              protégée par une clé gérée par Start’OnLab. Choisis un mot de passe que tu n’utilises nulle part ailleurs,
              protège ta messagerie avec un mot de passe unique et active la double authentification.
            </p>
            <p>Ton compte utilise ton adresse e-mail et un mot de passe, conservé par Supabase sous forme hachée : personne ne peut le lire. La copie en ligne contient tes données de budget sous forme chiffrée, avec un numéro de version et la date de la dernière mise à jour.</p>
          </>
        ) : (
          <>
            <p>
              Si tu l’actives dans Plus → Synchroniser mes appareils, ton budget est chiffré sur ton appareil avec une
              phrase secrète que toi seul connais (AES-256, clé dérivée par PBKDF2), puis envoyé à Supabase, notre
              sous-traitant d’hébergement de base de données, sur des serveurs situés en Irlande, dans l’Union européenne.
            </p>
            <p>
              Le serveur conserve uniquement : ton adresse e-mail et ton mot de passe sous forme hachée (pour te connecter), le bloc chiffré
              de ton budget, un numéro de version et la date de la dernière mise à jour. Ni Start’OnLab ni Supabase ne
              peuvent lire le contenu de ton budget. La phrase secrète n’est jamais transmise : si tu l’oublies, la copie
              en ligne ne peut pas être récupérée.
            </p>
          </>
        )}
        <p>
          La base légale est l’exécution du service de synchronisation associé à ton compte. Ces données sont
          conservées tant que ton compte existe. Tu peux supprimer à tout moment ton compte et sa copie chiffrée dans
          Synchroniser mes appareils : la suppression est immédiate et définitive sur le serveur.
        </p>
      </section>

      {/* Foyer : décrit seulement là où il est actif (docs/plans/P4-foyer.md §6.4, vérifié contre les migrations). */}
      {householdEnabled && (
        <section aria-labelledby="confidentialite-foyer" className="space-y-2">
          <h2 id="confidentialite-foyer" className="font-semibold text-gray-900">Foyer : budget partagé</h2>
          <p>
            Quand tu crées un Foyer ou que tu en rejoins un, les éléments communs (montants, libellés, dates et prénoms
            des membres) sont chiffrés sur ton appareil avant d’être envoyés chez Supabase, en Irlande. Ton budget
            Personnel n’est jamais partagé. Les données personnelles de chaque membre restent privées.
          </p>
          <p>
            Pour faire fonctionner le partage, le serveur conserve en clair : quels comptes sont membres de quel Foyer et
            depuis quand, quel compte a créé ou modifié chaque élément et à quel moment, et pour chaque invitation, une
            empreinte du lien et sa date d’expiration.
          </p>
          <p>
            Start’OnLab gère les clés du Foyer et peut déchiffrer ses données pour les restituer à ses membres. Une
            personne qui peut se connecter à ton compte, par exemple avec ton mot de passe ou via ta boîte e-mail, peut
            aussi ouvrir ton Foyer. Le service qui fournit la clé du Foyer est hébergé chez Vercel ; il vérifie que ton
            compte est bien membre avant de la donner.
          </p>
          <p>
            Un lien d’invitation est valable 7 jours, une seule fois. Toute personne qui obtient un lien encore valide peut
            rejoindre le Foyer avec son propre compte : envoie-le uniquement à la personne avec qui tu partages ce Foyer,
            et annule-le si tu l’as envoyé par erreur.
          </p>
          <p>
            Quand un membre quitte le Foyer ou que le partage avec lui est arrêté, ses accès au serveur sont coupés : les
            nouvelles informations du Foyer ne lui sont plus partagées. Certaines informations déjà consultées ou
            enregistrées par un ancien membre peuvent rester en sa possession : son appareil garde une copie chiffrée en
            lecture seule, qu’il peut consulter, télécharger ou effacer. Le fichier téléchargé n’est pas chiffré.
          </p>
          <p>
            Si tu supprimes ton compte, ton adhésion disparaît. Les entrées communes restent accessibles à l’autre membre
            et ton nom est retiré de leur attribution. Si tu es le dernier membre, le Foyer et ses entrées sont supprimés
            côté serveur.
          </p>
          <p>
            La base légale est l’exécution du service de partage demandé par les membres. Les données d’un Foyer sont
            conservées tant qu’au moins un membre y reste.
          </p>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold text-gray-900">{managedBackupsEnabled ? 'Verrouillage de l’application' : 'Verrouillage de l’application (facultatif)'}</h2>
        <p>Le verrou empêche une personne qui a ton téléphone en main de voir tes finances dans Capiste. Le code n’est jamais enregistré en clair : seule une empreinte calculée sur le téléphone est gardée.</p>
        <p>Il ne chiffre pas les données enregistrées sur ce téléphone et ne remplace pas le code du téléphone. Une personne capable de lire les données du navigateur, une extension malveillante ou une version modifiée de l’application ne sont pas arrêtées par ce verrou.</p>
        <p>Capiste masque son interface dès qu’elle perd le focus ou passe en arrière-plan. <strong>Sur iPhone, ce masquage n’atteint pas l’aperçu du sélecteur d’applications</strong> : iOS photographie l’écran avant que Capiste puisse le cacher. Essai du 21 novembre 2026 : l’aperçu montre les montants dans Chrome et dans Capiste installée sur l’écran d’accueil. Safari utilise le même moteur et devrait se comporter de la même façon.</p>
        <p>Pour un aperçu sans aucun montant, appuie sur le cadenas en haut de l’écran avant de quitter Capiste : l’aperçu montre alors l’écran du code.</p>
        <p>Sans le code, la seule issue est d’effacer Capiste sur ce téléphone. Une copie en ligne ou un fichier de sauvegarde permettent ensuite de récupérer le budget.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-gray-900">Accès et effacement</h2>
        <p>
          Tu peux consulter et modifier tes données dans l’application, télécharger une copie JSON dans
          Sauvegarde, ou les effacer dans Réglages. Les données restent dans le navigateur jusqu’à leur
          effacement. Les sauvegardes téléchargées restent dans le dossier où tu les as enregistrées.
        </p>
        <p>
          Pour toute question sur tes données ou pour exercer tes droits (accès, rectification, effacement,
          opposition), écris à contact@startonlab.be. Tu peux aussi introduire une réclamation auprès de
          l’Autorité de protection des données (autoriteprotectiondonnees.be).
        </p>
        <p>
          La sauvegarde JSON contient tes données financières en clair. Garde-la dans un endroit auquel
          toi seul ou les personnes que tu autorises ont accès.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-gray-900">Hébergement</h2>
        <p>
          Vercel Inc. intervient comme sous-traitant pour l’hébergement du site. Lors des visites en ligne,
          Vercel traite ton adresse IP et les données techniques nécessaires pour servir et sécuriser le site.
          Ces données peuvent être transférées vers les États-Unis.
        </p>
        {managedBackupsEnabled && <p>Le service qui restitue les clés des nouvelles copies est hébergé chez Vercel. Il vérifie le jeton de connexion et traite l’identifiant du compte pour fournir sa clé.</p>}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-gray-900">Fonctionnement hors ligne</h2>
        <p>
          Le navigateur garde une copie des pages et des ressources de l’application pour pouvoir les ouvrir
          sans réseau. Ce cache ne contient pas les données de ton budget. Capiste n’utilise ni cookie
          publicitaire ni outil de mesure d’audience.
        </p>
      </section>
    </article>
  );
}
