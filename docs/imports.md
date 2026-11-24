# Imports des données du jeu

## Import du catalogue d'objets

Les objets, armes, véhicules et ressources de `/items` peuvent être importés
depuis les sources publiques du jeu :

```bash
npm run import:catalogue -- rsi              # vaisseaux (matrice officielle RSI + points de vente Fleetyards)
npm run import:catalogue -- scwiki           # armes, armures, accessoires, composants (Star Citizen Wiki, en français)
npm run import:catalogue -- uex              # ressources et cours par comptoir (UEX Corp)
npm run import:catalogue -- all --update     # tout, en rafraîchissant les objets déjà importés
npm run import:catalogue -- link             # relie seulement les emplacements aux fiches, sans importer
```

Options utiles : `--dry-run` (n'écrit rien), `--limit N`, `--filter texte`,
`--types WeaponPersonal,Char_Armor_Helmet` (types du wiki), `--no-fleetyards`,
`--mirror-images` (recopie les images dans le blob storage, `BLOB_READ_WRITE_TOKEN`
requis ; sinon les fiches pointent vers les images de la source).

Chaque objet importé porte sa provenance : relancer l'import ne crée jamais de
doublon. Sans `--update`, un objet déjà présent est laissé tel quel ; avec, la
source rafraîchit ce qu'elle connaît (caractéristiques, image, emports, cours…)
en gardant ce qu'un administrateur a ajouté à la main — et une description ou
une provenance réécrites ne sont jamais écrasées.

Les points d'emport, composants et accessoires sont **appariés par nom** aux
fiches du catalogue : un emplacement qui nomme un objet sans pointer vers sa
fiche renvoie vers la fiche du même nom, sur la page comme dans le formulaire
d'administration (le script relie après chaque import, dans l'ordre que l'on
veut : vaisseaux d'abord ou armes d'abord). En retour, chaque fiche d'arme ou
de composant liste les vaisseaux qui l'embarquent d'origine. Les montures,
tourelles et racks de missiles que la matrice RSI nomme sur les vaisseaux
s'importent avec `scwiki --types Turret,MissileLauncher`.

> Le script lit `MONGODB_URI` dans `.env.local`. Il s'exécute hors de Next
> (`tsx`) : aucune permission applicative n'est vérifiée, réservez-le aux
> opérateurs.

## Import des blueprints, factions et missions

Les blueprints de `/crafting`, les factions et les missions de `/missions`
viennent de l'[API du Star Citizen Wiki](https://api.star-citizen.wiki).
[scmdb.net](https://scmdb.net) reste branché en secours (`--source scmdb`) :
les deux partagent les GUID des blueprints, tirés des fichiers du jeu.

```bash
npm run import:game-data -- all --dry-run    # le rapport de ce qui changerait, sans rien écrire
npm run import:game-data -- all              # dernière version LIVE : blueprints, factions, missions, réputations
npm run import:game-data -- reputations      # seulement la liste des factions de /reps
npm run import:game-data -- wikelo           # seulement les échanges de Wikelo
npm run import:game-data -- images           # illustrations des blueprints qui n'en ont pas
```

Le wiki est lu par ses listes, à 200 lignes par page : une cinquantaine de
requêtes pour tout. La recette complète d'un blueprint n'est qu'à son détail ;
elle n'est demandée que pour les blueprints nouveaux ou dont les ingrédients
ont changé (`--refresh-recipes` pour toutes les redemander).

Ce que le wiki n'a pas :

- **Le montant de la récompense** de beaucoup de missions : une mission déjà
  en base garde le sien.
- **Le type de mission du jeu** (Mercenary, Delivery…) : sa liste n'a que la
  famille de la mission (Security, Hauling…), qui sert de type. La catégorie
  (career, story, event) reste celle déjà en base.
- **La sous-catégorie des blueprints** : une fiche garde la sienne.
- **Certains titres** que le jeu remplit à l'affichage
  (`[Contractor|BountyTitle]`) : ils ne remplacent pas le titre en base et ne
  créent pas de mission.

**Réputations.** La liste des factions de /reps (document `configuration` de
clé `reputations`) suit les factions du wiki qui ont un barème de réputation,
lu au détail de chacune (une quarantaine de requêtes). Une faction est
retrouvée par son GUID, sinon par son nom ; ses rangs sont remplacés par ceux
du jeu, et les réputations déjà saisies par les joueurs suivent les factions,
carrières et rangs renommés (un rang que le jeu n'a plus devient le rang
retrouvé juste en dessous). Le wiki ne donne qu'un barème par faction : les
autres pistes viennent des missions, qui disent quelle réputation elles font
monter (Security chez Eckhart Security, dont le barème est `Standing`). Le
wiki n'a pas le barème de ces pistes : chacune prend celui de la liste dont
les rangs sont ceux que ses missions demandent (Security de Northrock,
Bounty Hunting de MicroTech Protection Services). Une piste sans barème
reconnu (Courier, Hired Muscle) est seulement signalée au rapport : saisir
son barème à la main pour une faction suffit pour que l'import suivant
l'ajoute aux autres. Les carrières saisies à la main restent, comme le
standing (Hostile, Neutral, Ally), que le wiki ne donne pas. Rien n'est
supprimé : une faction qui disparaît du wiki est marquée `removedInVersion`.

**Échanges de Wikelo.** Les échanges du marchand banu de l'Emporium sont des
contrats donnés par Wikelo (`filter[mission_giver]=Wikelo`) : la liste en
donne le résumé, le détail de chaque contrat publié dit ce qu'il faut apporter
(`hauling_orders`, à l'unité ou en SCU pour une ressource), ce qu'il donne
(`reward_groups`, un lot ou plusieurs tirés au hasard) et les blueprints qui
viennent avec, soit environ 70 requêtes. Ils vont dans `wikeloTrades`, suivis
par l'uuid du contrat ; un échange qui disparaît est marqué `removedAt`. Les
fiches objet montrent les échanges qui donnent l'objet et ceux qui le
demandent, les fiches blueprint ceux qui donnent le blueprint : un objet est
retrouvé par l'uuid du jeu (`source.id` des objets importés du wiki), sinon par
son nom ; un blueprint par son GUID. Le MCP les expose par
`search_wikelo_trades`, `get_item` et `get_blueprint_by_slug`. `all` les
importe aussi (sauf avec `--dir`) ; lancer `npm run ensure:indexes` avant le
premier import.

Le wiki regroupe aussi les variantes d'une mission sous une seule fiche, là où
les premiers imports (scmdb) en faisaient plusieurs : au passage au wiki, ces
fiches sont fusionnées et leurs liens redirigent vers la mission qui les
regroupe.

`--blueprints-source` et `--missions-source` choisissent la source de chaque
partie.

Options utiles : `--version 4.10.1-LIVE.12660092` (une version précise),
`--dir dossier` (avec scmdb, des fichiers `merged-<V>.json` et
`crafting_blueprints-<V>.json` déjà téléchargés), `--mirror-images` (avec
`images`, recopie dans le blob storage), `--allow-mass-removal`.

Les fichiers de scmdb sont gardés dans `.cache/game-data/scmdb/` : un second
import ne les retélécharge pas.

Ce que l'import garantit :

- **Un blueprint est suivi par son GUID**, une mission par ses identifiants de
  contrat et ses noms techniques, jamais par leur nom. Quand le jeu renomme un
  blueprint, sa fiche est mise à jour : son `_id` ne change pas, les joueurs
  qui le possèdent le gardent, et l'ancien slug redirige vers le nouveau. Les
  homonymes (quatre refroidisseurs « Cryo-Star SL ») ont chacun leur fiche.
- **Rien n'est supprimé.** Ce qui disparaît du jeu est marqué
  `removedInVersion` : la mission sort des listes mais sa page reste, avec un
  avertissement ; une mission que la source a fusionnée dans une autre
  redirige vers elle.
- **Les saisies des administrateurs sont gardées** : nom, description, slug,
  image, statistiques, et le texte « Obtention » dès qu'il n'est plus celui que
  l'import avait écrit.
- **La source est vérifiée avant toute écriture.** Un champ renommé par la
  source, une réponse qui n'est plus du JSON, ou un import qui retirerait d'un
  coup plus de 20 % du catalogue arrêtent l'import sans rien toucher.

Une fiche d'objet du catalogue importée du wiki retrouve aussi ses blueprints
par l'identifiant d'entité du jeu, quel que soit leur nom.

Le premier passage rattache les fiches des anciens imports à leur GUID grâce à
l'export qui leur a servi (`assets/blueprints.json` et `assets/missions.json`,
lus automatiquement s'ils sont là). Lancer ensuite `npm run ensure:indexes`.
Une fiche absente de cet export (créée à la main ou par un autre script) est
rattachée par son nom actuel dans la source.

Si un import a créé une seconde fiche à côté d'une fiche sans GUID (le
rapport les signale comme doublons), `merge:blueprints` les réunit dans
l'ancienne : possessions des joueurs, missions et objets liés suivent, et le
slug de la fiche importée redirige.

```bash
npm run merge:blueprints                 # les paires trouvées, sans rien écrire
npm run merge:blueprints -- --apply      # fusionner
npm run import:game-data -- all          # régénérer les textes d'obtention
```

## Import des avant-postes extraits des fichiers du jeu

Les avant-postes de Nyx I, leur position et leur plan viennent d'un export
fait hors ligne sur un poste qui a le jeu (`export_nexus.py`, à côté des outils
qui lisent le `Data.p4k`). Le fichier `*.nexus.json` décrit un corps, ses
secteurs, ses groupes d'avant-postes et les avant-postes, parents d'abord ;
chaque avant-poste porte sa position dans le repère du corps et ses plans
dessinés (le bâtiment principal niveau par niveau, et une vue générale avec
les tourelles et les tours de garde). Ce ne sont que nos relevés : aucun
fichier du jeu n'en fait partie.

```bash
npm run import:outposts -- nyx-i-outposts.nexus.json --offline --previews ./apercus   # sans base : vérifie, mesure, rend les aperçus
npm run import:outposts -- nyx-i-outposts.nexus.json --dry-run                       # ce qui changerait en base
npm run import:outposts -- nyx-i-outposts.nexus.json                                 # import, aperçus envoyés au blob storage
npm run clean:blobs -- --apply                                                       # ensuite, les anciens aperçus
```

- **Arborescence** : corps › secteurs › groupes › avant-postes. Secteurs et
  groupes sont des lieux de type `region`.
- **Provenance** `game-files`, avec l'identifiant du jeu : relancer l'import
  met à jour les mêmes fiches. La description, l'image, les services et les
  astuces posés par quelqu'un restent.
- **Position** marquée `game-files`. Une position relevée par un joueur n'est
  jamais remplacée, et `import:star-map` ne touche pas celles-ci.
- **Plans** remplacés tant que personne ne les a retouchés (empreinte
  `source.plansHash`) ; un plan modifié à la main est gardé.
- **Un lieu importé que le jeu n'a plus est supprimé**, au besoin avec un plan
  retouché. Les lieux créés à la main qu'il contenait remontent à son parent.
