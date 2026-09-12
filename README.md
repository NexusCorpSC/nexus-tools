# Development

## Setup

- Pull mongo image through podman

```bash
podman pull docker.io/library/mongo
```

- Start a mongodb database, as a one-node replica set

```bash
podman run --name mongo -d -p 27017:27017 mongo --replSet rs0
podman exec mongo mongosh --eval "rs.initiate()"
```

> Un replica set plutôt qu'un `mongod` seul : c'est ce que le flux
> d'événements (`/api/events`, voir plus bas) demande pour écouter les
> écritures. Un `mongod` seul marche encore — le flux se rabat alors sur une
> lecture par seconde — mais ce n'est pas ce qui tourne en production.

### Environment variables

Create a `.env.local` file and add the environment variables.

```bash
touch .env.local
```

```
BETTER_AUTH_SECRET="" # openssl rand -base64 32
MONGODB_URI="mongodb://localhost:27017/?directConnection=true" # MongoDB connection string (directConnection: rs.initiate() advertises the container's hostname, which the host cannot resolve)
RESEND_API_KEY="CONSOLE" # Display signin OTP in console. Replace by Resend API Key to send real emails.
BLOB_READ_WRITE_TOKEN="" # Blob read/write token for vercel storage
DISCORD_CLIENT_ID=""
DISCORD_CLIENT_SECRET=""
```

## Run

- Start dev server

```bash
npm run dev
```

## Build & Commits

Build the app with:

```bash
npm run build
```

> Dev server doesn't run full analysis and type cheking. Run build to detect build issues.

## Escouades

`/squads` tient l'état d'une escouade en temps réel — qui est prêt, qui est à
terre, qui tient quel rôle, l'annonce du chef — et le raid qui en regroupe
plusieurs. C'est la même escouade que Nexus App affiche par-dessus le jeu :
la page et la superposition écrivent sur les mêmes routes, `/api/squads` et ses
sous-routes, et lisent la même vue sur le flux d'événements (`/api/events`,
sujet `squad`, voir plus bas) — la page ne tient le flux que tant que l'onglet
est visible.

La page est pensée pour un téléphone d'abord : une seule colonne, les deux
états d'une ligne (prêt, à terre) en boutons pleine hauteur, le reste derrière
le menu de la ligne, et les feuilles de gestion (rôles, raid) qui montent du
bas de l'écran. Plus large, la vue de raid passe sur deux colonnes et rien
d'autre ne bouge.

Un joueur est dans une escouade, sauf l'organisateur d'un raid, qui en ouvre
d'autres depuis « Gérer le raid » et les mène jusqu'à passer la main : la page
en regarde une à la fois (un sélecteur à côté du titre), et sur la vue de raid
toutes celles dont il est membre se manipulent. Côté API, chaque route accepte
`?squad=<id>` pour dire laquelle elle vise ; sans lui, la plus ancienne des
appartenances.

## Flux d'événements

`GET /api/events` tient **une connexion par client** (Server-Sent Events) et y
pousse tout ce que ce client suit : l'escouade, le bloc-notes, et demain les
notifications. C'est ce qui remplace l'interrogation toutes les deux secondes
que faisaient la page `/squads` et la superposition de Nexus App — N membres ×
une requête toutes les 2 s, chacune coûtant une lecture de session et une à
trois requêtes Mongo, pour un état qui ne change que quelques fois par minute.

```
GET /api/events?topics=squad,note&squad=<id>
  topics : sous-ensemble de {squad, note}, tout par défaut
  squad  : paramètre du sujet squad, même sens que sur GET /api/squads
Accept: text/event-stream
Cookie: <session better-auth>

200  Content-Type: text/event-stream

retry: 1000
event: squad.view   id: squad:<empreinte>   data: <SquadView>   ← instantané à la connexion
event: note         id: note:<empreinte>    data: <Note>        ← instantané à la connexion
: ping                                                           ← toutes les 20 s
event: squad.view / event: note                                  ← à chaque changement
event: bye          data: {"reason":"rollover"}                  ← ~20 s avant maxDuration
```

- **Chaque sujet renvoie son instantané à chaque connexion.** Pas de
  `Last-Event-ID` : un seul identifiant ne peut pas décrire l'état de
  plusieurs sujets, et un instantané par sujet toutes les quelques minutes ne
  vaut pas un protocole de reprise. Un événement de sujet n'est émis que si son
  empreinte (`sha1` du JSON) change.
- **La fonction est bornée.** Sur Vercel elle vit au plus `maxDuration`
  (300 s, ce qui demande Fluid compute) : peu avant, le serveur dit `bye` et
  ferme, le client se reconnecte aussitôt et reçoit de nouveaux instantanés.
- **401** : le client s'arrête. **404** (serveur pas encore déployé) : Nexus
  App retombe sur `GET /api/squads` toutes les 10 s tant que la superposition
  d'escouade est visible, et re-sonde `/api/events` toutes les cinq minutes.
- **Ordre entre pushes et écritures**, côté clients : un push dont
  `squad.version` est strictement inférieur à celui affiché pour la même
  escouade est ignoré ; pendant une écriture en vol, les pushes sont retenus et
  le dernier est appliqué une fois la réponse de l'écriture posée. Pour la note,
  l'éditeur adopte la révision reçue sauf brouillon non enregistré ou
  sauvegarde en cours.

### Comment le serveur sait qu'il y a du nouveau

Sur Vercel, la fonction qui traite une écriture n'est pas celle qui tient le
flux : rien ne peut passer en mémoire de l'une à l'autre. C'est la base qui
diffuse. `lib/events/hub.ts` ouvre **un seul change stream par processus** —
pas un par connexion — sur les collections des sujets, et fait le routage en
mémoire : chaque sujet tient, par utilisateur connecté, l'index des documents
dont sa vue dépend (son escouade, les sous-escouades du raid, ses
appartenances, le raid) et dit quels utilisateurs un événement concerne. Une
suppression n'a pas de document : elle est attrapée par son `_id`, et c'est
justement ce qui permet à un départ d'escouade de se voir. Les rafales sont
lissées (50 ms) avant une relecture par sujet, et un push ne part que si la vue
a changé.

Un change stream demande un replica set. Quand la base n'en est pas un (le
`mongod` seul du poste de développement), le premier curseur échoue en le
disant, et le concentrateur se rabat pour la durée du processus sur un
**ticker** : une lecture projetée par sujet et par seconde pour les utilisateurs
connectés, comparée à la précédente. Plus lent d'une seconde, mais toujours une
requête par sujet par seconde quel que soit le nombre de connectés.

Le concentrateur s'ouvre avec le premier abonné et se ferme cinq secondes après
le dernier : une instance qui ne sert que des écritures n'ouvre jamais de
curseur.

### Ajouter un sujet

Écrire un `Topic` (`lib/events/topic.ts`) : sa collection, sa lecture
(`snapshot`), ce qu'il indexe par utilisateur (`index`), qui un événement
concerne (`affected`) et sa version ticker (`tick`) ; l'inscrire dans `TOPICS`
(`lib/events/hub.ts`) et dans `EVENT_TOPICS` / `EVENT_NAMES`
(`types/events.ts`). Côté site, `useEventStream` (`lib/use-event-stream.ts`)
le reçoit ; côté Nexus App, Rust ignore les événements qu'il ne connaît pas,
jusqu'à ce qu'on lui dise à quelle fenêtre les remettre.

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
