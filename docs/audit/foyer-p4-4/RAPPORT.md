# Audit contradictoire — PR #32 (Foyer, avances et transferts), migrations de lecture

Commit audité : `607a8a9` (`p4-4-avances-transferts`). Audit indépendant : Postgres 16 local avec les rôles et privilèges par défaut de Supabase (`supabase-stub.sql`). Les migrations de la PR sont appliquées sur une base qui contient déjà des foyers et des écritures. Aucune donnée ni aucun réglage de production n'a été modifié.

## Verdict

**GO sous conditions** pour la sécurité des lectures : aucun chemin ne permet à un membre, un ancien membre, un non-membre ou un anonyme de lire un identifiant de compte Supabase.

**NO-GO pour une fusion seule.** La PR et ses migrations ne sont pas compatibles avec le client actuellement sur `main`, dans aucun des deux sens. Elles doivent partir ensemble, dans l'ordre décrit plus bas.

## Résultats

`audit.test.mjs` (26 tests) et `compat.test.mjs` (4 tests) : **30/30**.

| Profil | Tables directes | `pull_records` | `list_my_households` | `upsert_records` |
| --- | --- | --- | --- | --- |
| Membre actif (A, B) | adhésions et éléments de son foyer, sans `user_id`, `created_by`, `updated_by`, `token_hash` | autorisé, sans identifiant de compte | ses adhésions actives et les identifiants de membre | autorisé ; élément exclusif modifiable par son seul auteur |
| Ancien membre (C) | rien de l'ancien foyer | refusé (42501) | vide | refusé (42501) |
| Non-membre (D) | seulement son propre foyer | refusé (42501) | son foyer seulement | refusé (42501) |
| Anonyme | refusé (42501) | aucun droit d'exécution | aucun droit d'exécution | aucun droit d'exécution |

Contrôles du catalogue :

- **Aucune fonction de `public` n'est exécutable par `anon` ni par `PUBLIC`.**
- `upsert_records`, `pull_records` et `list_my_households` : `security definer`, `search_path` vide, exécution par `authenticated`.
- **Aucune fonction exécutable par `authenticated` ne renvoie** `user_id`, `created_by`, `updated_by`, `token_hash`, ni une ligne complète des tables du foyer.
- **Colonnes lisibles par `authenticated`** : aucun identifiant de compte, à part `budget_vaults.user_id`, que le RLS limite au coffre de l'utilisateur lui-même.
- **Écritures directes** (`insert`, `update`, `delete`) : refusées pour tous les profils.
- **Exclusivité** : l'auteur est fixé par le serveur. La charge utile ne permet ni de se déclarer auteur, ni de retirer l'exclusivité, et rejouer le reçu d'écriture d'un autre membre est refusé.
- **Rattrapage** : les écritures antérieures à la migration sont attribuées à leur rédacteur, et l'attribution survit à la suppression du compte.
- **Realtime** : non utilisé par le code.

Côté client, les transferts ne créditent que si l'auteur de la réponse, fixé par le serveur, est le destinataire déclaré, et l'auteur de la déclaration l'émetteur.

## Compatibilité ancien client / nouveau schéma (point soulevé)

| Situation | Effet mesuré |
| --- | --- |
| Client de `main` sur le nouveau schéma (migrations appliquées, #32 non fusionnée) | `listHouseholds()` filtre sur `household_members.user_id` : refus 42501. Le Foyer s'affiche « indisponible ». `pull_records` ne renvoie plus `updated_by`. L'ancien format d'écriture reste accepté. **Pas de corruption, mais le Foyer est coupé.** |
| Client de la #32 sur l'ancien schéma (fusion avant les migrations) | `list_my_households` est absente (42883) et le contrôle de capacité échoue (42703). **Foyer indisponible, aucune écriture.** |

**Exposition réelle :** le drapeau `NEXT_PUBLIC_HOUSEHOLD_ENABLED` n'est actif qu'en Preview. La production n'affiche pas le Foyer et n'est donc pas touchée. En revanche, **Preview et production partagent la même base Supabase** : pendant l'intervalle, puis tant qu'elles ne sont pas mises à jour, les préversions construites sans la #32 n'ont plus de Foyer.

**État de la production** (lecture seule, clé publique) : les migrations `households` et `household_writes` sont appliquées. `author_member_id`, `editor_member_id` et `list_my_households` n'existent pas encore.

## Constats complémentaires (dossier d'audit de ChatGPT, vérifiés dans le code)

1. **Le budget Personnel devient illisible pour l'ancien build.** Les miroirs créés par la #32 utilisent le type de revenu `household_transfer` et la catégorie de dépense `household`, que le schéma de `main` refuse (`lib/budget-schema.ts`). Un compte qui a reçu un miroir ne s'ouvre plus avec un build antérieur à la #32, même restauré depuis sa copie en ligne. Comme Preview et production partagent la même base, cela vaut pour tout compte de test utilisé sur une préversion Foyer.
2. **Le Foyer de l'ancien client tombe dès le premier élément d'un type inconnu.** Le décodeur de `main` refuse `transfer-response`, et `decodeHouseholdView` charge tout d'un bloc (`Promise.all`) : un seul élément refusé bloque toute la vue.

Conséquences sur ce rapport :
- le retour arrière par l'application n'est sûr **qu'avant la première écriture de la PR 4** ;
- entre les migrations et la fusion, n'utiliser **aucune** fonction de la PR 4 sur une préversion ;
- recommandation pour la suite (non bloquante) : rendre la lecture tolérante, en ignorant et signalant un élément illisible ou d'un type inconnu au lieu de rejeter tout le Foyer ou tout le budget.

La stratégie de compatibilité proposée par ChatGPT (contrat historique conservé, `pull_records` versionné, écritures gelées, build de secours) protège des anciens clients qui n'existent aujourd'hui que sur les préversions. Elle ne se justifie que si un vrai foyer pilote utilise déjà le Foyer sur une préversion.

## Remarques non bloquantes

1. `service_role` garde l'exécution d'`upsert_records`, héritée de la migration de `main`. C'est sans effet : c'est une clé serveur, et `auth.uid()` y est vide. Les deux nouvelles fonctions la retirent ; on peut aligner plus tard.
2. Un élément exclusif dont l'auteur a supprimé son compte n'est plus modifiable par personne. C'est cohérent avec un historique de transferts.
3. Quand le Foyer sera ouvert en production, il faudra découper ce type de migration en deux temps : d'abord ajouter les nouveaux éléments, ensuite retirer les anciennes lectures. Ce n'est pas nécessaire aujourd'hui, puisque le Foyer n'est pas en production.

## Plan de déploiement (à exécuter seulement après autorisation explicite)

1. **Préalables**
   - #32 à jour sur `main`, CI et Vercel verts sur le SHA final.
   - Tests Supabase de la PR, `docs/audit/foyer-p4-4` sur les migrations de la PR, et parcours Chromium.
2. **Sauvegarde** : vérifier qu'une sauvegarde récente de la base existe (tableau de bord Supabase), ou exporter les tables `household_*` et `households`.
3. **Migrations en production**, dans l'ordre et chacune dans sa transaction :
   1. `20261122212700_household_record_authors.sql`
   2. `20261123003000_household_member_reads.sql`

   À partir de là, le Foyer est indisponible sur les préversions qui n'ont pas la #32. La production ne change pas.
4. **Contrôles immédiats en lecture seule** avec la clé publique : `household_records?select=author_member_id` répond 401/42501 (et non plus 42703), et `rpc/list_my_households` répond 401 (et non plus 404).
5. **Fusion de la #32** dans la foulée, sans utiliser entre-temps aucune fonction de la PR 4 sur une préversion. Le déploiement de production ne montre aucun changement, puisque le drapeau est désactivé.
6. **Essai sur la préversion de `main`** avec deux comptes de test :
   - liste des foyers ;
   - avance ;
   - transfert, puis confirmation par le destinataire ;
   - historique sur un appareil neuf ;
   - accès d'un ancien membre refusé.
7. **Mise à jour sur `main`** des PR ouvertes (#23, #31, #35) pour que leurs préversions retrouvent le Foyer.

Les migrations passent avant la fusion. On vérifie ainsi le schéma avant d'envoyer le code. Le retour arrière du schéma est non destructif, et le contrôle de capacité du nouveau client empêche de toute façon toute écriture tant que la base n'est pas migrée.

## Retour arrière

- **Application, avant toute écriture de la PR 4** : *Instant Rollback* Vercel vers le déploiement précédent, ou revert du commit de fusion par PR (`git revert -m 1`).
- **Application, après une écriture de la PR 4** : **pas de retour vers un build antérieur à la #32.** Les budgets Personnel qui contiennent un miroir y deviendraient illisibles. Corriger en avant, ou désactiver le Foyer en gardant les lecteurs de la #32.
- **Base**, uniquement si l'ancien Foyer doit refonctionner sur les préversions : exécuter `retour-arriere.sql` (testé).
  - Il rétablit la lecture complète des deux tables et l'ancienne forme de `pull_records`.
  - Il **ne supprime aucune donnée** : colonnes d'auteur, exclusivité, déclencheur et `list_my_households` restent en place.
  - Effet assumé : les identifiants de compte redeviennent lisibles entre membres, comme sur `main` aujourd'hui.
- **À ne pas faire** : supprimer les colonnes `author_member_id`, `editor_member_id` ou `exclusive`. Cela effacerait l'exclusivité et l'attribution des transferts.

## Rejouer l'audit

```bash
# Postgres 16 jetable (hors root : utilisateur postgres)
initdb -D /tmp/pg/data -U postgres --auth=trust && pg_ctl -D /tmp/pg/data -o "-p 55432 -k /tmp/pg" start
# Depuis une copie de la branche de la PR #32 (ou MIGRATIONS_DIR=<dossier des migrations>)
PGHOST=/tmp/pg PGPORT=55432 node --test docs/audit/foyer-p4-4/audit.test.mjs docs/audit/foyer-p4-4/compat.test.mjs
```

## Après déploiement (23 novembre 2026)

- Les deux migrations fusionnées dans `main` (`515c2bf`) sont **identiques à l'octet près** à celles auditées (`607a8a9`). Le code client du Foyer n'a pas changé non plus.
- Sondes anonymes en production : nouvelles colonnes et `list_my_households` présentes et refusées à `anon` ; `household_members.user_id` refusé.
- `controle-production.sql` : requête en lecture seule à exécuter dans l'éditeur SQL de Supabase. Elle compare le catalogue réel aux valeurs auditées : empreintes des fonctions, droits d'exécution, colonnes lisibles, écritures directes, RLS, politiques, déclencheur, publications. Chaque ligne doit afficher `ok = true` ; validée sur le schéma audité (24/24).
