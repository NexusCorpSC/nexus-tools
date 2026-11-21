# Escouades

`/squads` tient l'état d'une escouade en temps réel — qui est prêt, qui est à
terre, qui tient quel rôle, l'annonce du chef — et le raid qui en regroupe
plusieurs. C'est la même escouade que Nexus App affiche par-dessus le jeu :
la page et la superposition écrivent sur les mêmes routes, `/api/squads` et ses
sous-routes, et lisent la même vue sur le flux d'événements (`/api/events`,
sujet `squad`, voir [flux-evenements.md](flux-evenements.md)) — la page ne tient le flux que tant que l'onglet
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

**Ready check.** Le chef d'une escouade ou un de ses lieutenants demande à
l'escouade de se déclarer prête (`POST /api/squads/ready-check`) ; celui qui
commande l'escouade meneuse le demande à tout le raid
(`POST /api/squads/raid/ready-check`). Dans les deux cas, chaque membre
concerné repasse « non prêt » dans la même écriture que celle qui pose le
marqueur (`readyCheck` : un identifiant frais, l'heure, et qui l'a demandé)
sur l'escouade ou sur le raid. Rien d'autre n'est stocké : qui a répondu, c'est
la liste elle-même. Le flux d'événements porte la vue mise à jour à chacun ;
un client qui y voit un `readyCheck` qu'il ne connaissait pas affiche une
notification avec un bouton « Prêt », qui n'est rien d'autre que le `PATCH` de
sa propre ligne.

**Annonces.** Chaque écriture d'une annonce — celle d'une escouade
(`PATCH /api/squads/announcements`) comme celle du raid (`PATCH /api/squads/raid`)
— pose `announcedAt`, même quand le texte n'a pas changé : c'est ainsi que
Nexus App **renvoie** une annonce, et c'est ce tampon, pas le texte, qu'il
compare pour sonner. La page n'enregistre donc pas un texte laissé intact.

