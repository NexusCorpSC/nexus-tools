# Documentation technique de Nexus Tools

Le [README](../README.md) présente le site aux joueurs. Ici, ce qu'il faut pour
le développer et l'exploiter.

| Document | Contenu |
| --- | --- |
| [developpement.md](developpement.md) | base locale, variables d'environnement, lancer et construire, scripts, ce qu'il faut lancer après un déploiement |
| [imports.md](imports.md) | import du catalogue d'objets, des blueprints, factions, missions et réputations |
| [flux-evenements.md](flux-evenements.md) | `GET /api/events` (Server-Sent Events) : protocole, change streams, ajouter un sujet |
| [escouades.md](escouades.md) | `/squads` : escouades, raids, ready check, annonces |
| [connexion-nexus-app.md](connexion-nexus-app.md) | connexion de l'application de bureau (redirection loopback + PKCE) |

Pour les intégrations : le serveur MCP est à `https://tools.services.nexus/mcp`,
et la page [/developers](https://tools.services.nexus/developers) explique
comment s'y connecter (OAuth, outils disponibles, limites).
