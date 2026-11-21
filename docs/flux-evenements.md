# Flux d'événements

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

## Comment le serveur sait qu'il y a du nouveau

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
requête par sujet par seconde quel que soit le nombre de connectés. Un curseur
qui échoue trois fois de suite pour une autre raison — un palier, un rôle —
mène au même repli, avec le code et le message de l'erreur dans les journaux,
plutôt qu'à des réessais sans fin pendant lesquels rien ne serait poussé.

Le concentrateur s'ouvre avec le premier abonné et se ferme cinq secondes après
le dernier : une instance qui ne sert que des écritures n'ouvre jamais de
curseur.

## Ajouter un sujet

Écrire un `Topic` (`lib/events/topic.ts`) : sa collection, sa lecture
(`snapshot`), ce qu'il indexe par utilisateur (`index`), qui un événement
concerne (`affected`) et sa version ticker (`tick`) ; l'inscrire dans `TOPICS`
(`lib/events/hub.ts`) et dans `EVENT_TOPICS` / `EVENT_NAMES`
(`types/events.ts`). Côté site, `useEventStream` (`lib/use-event-stream.ts`)
le reçoit ; côté Nexus App, Rust ignore les événements qu'il ne connaît pas,
jusqu'à ce qu'on lui dise à quelle fenêtre les remettre.

