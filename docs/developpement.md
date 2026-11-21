# Développement

Ce qu'il faut pour faire tourner le site en local, le construire et le
déployer. Le reste de la documentation technique est listé dans
[l'index de la documentation](README.md).

## Mise en place

- Récupérer l'image MongoDB (ici avec podman ; docker marche de la même façon)

```bash
podman pull docker.io/library/mongo
```

- Démarrer une base MongoDB en replica set à un nœud

```bash
podman run --name mongo -d -p 27017:27017 mongo --replSet rs0
podman exec mongo mongosh --eval "rs.initiate()"
```

> Un replica set plutôt qu'un `mongod` seul : c'est ce que le flux
> d'événements (`/api/events`, voir [flux-evenements.md](flux-evenements.md)) demande pour écouter les
> écritures. Un `mongod` seul marche encore — le flux se rabat alors sur une
> lecture par seconde — mais ce n'est pas ce qui tourne en production.

### Variables d'environnement

Créer un fichier `.env.local` :

```bash
touch .env.local
```

```
BETTER_AUTH_SECRET="" # openssl rand -base64 32
MONGODB_URI="mongodb://localhost:27017/?directConnection=true" # directConnection : rs.initiate() annonce le nom du conteneur, que l'hôte ne sait pas résoudre
RESEND_API_KEY="CONSOLE" # Affiche le code de connexion dans la console ; une clé Resend envoie de vrais e-mails
BLOB_READ_WRITE_TOKEN="" # Vercel Blob (images téléversées)
DISCORD_CLIENT_ID="" # Connexion avec Discord
DISCORD_CLIENT_SECRET=""
ANTHROPIC_API_KEY="" # Nexus Chat (Claude). Sans elle le chat répond une erreur ; l'accès se gère dans /admin/chat
GOOGLE_GENERATIVE_AI_API_KEY="" # Voix de Nexus Chat (Gemini). Sans elle, la saisie vocale est indisponible.
```

Variables facultatives :

| Variable | Rôle |
| --- | --- |
| `NEXT_PUBLIC_BASE_URL` / `BETTER_AUTH_URL` | adresse publique du site (liens, OAuth du serveur MCP, origines de confiance) ; `https://tools.services.nexus` par défaut |
| `DEV_URL` | hôte supplémentaire autorisé pour les server actions en développement |
| `DISCORD_TOKEN`, `DISCORD_PUBLIC_KEY`, `AI_ALLOWED_DISCORD_IDS`, `BREIGN_ENDPOINT`, `BREIGN_API_KEY` | bot et commandes Discord (`/discord`, `/admin/discord`) |
| `MCP_URL`, `MCP_TOKEN`, `MCP_SMOKE_*` | essai de fumée du serveur MCP (`npm run mcp:smoke`) |

> Pour un simple `npm run build`, des valeurs factices suffisent
> (`MONGODB_URI`, `BETTER_AUTH_SECRET`…). Une vraie base locale jetable est
> aussi possible avec `mongodb-memory-server`.

## Lancer

- Créer les index (une fois par base, et de nouveau après un déploiement qui en ajoute)

```bash
npm run ensure:indexes
```

> Tous les index de la base sont déclarés dans `scripts/ensure-indexes.ts`,
> et nulle part ailleurs : le code de l'application ne crée aucun index au
> démarrage. Un `createIndex` par premier appel d'un processus, c'est une
> commande de plus par instance démarrée — et sur Vercel, autant d'instances
> que de réveils. Le script est idempotent, et porte la migration de l'index
> des membres d'escouade (unique → simple) pour les bases écrites par une
> version antérieure.

- Démarrer le serveur de développement

```bash
npm run dev
```

## Construire

Construire le site :

```bash
npm run build
```

> Le serveur de développement ne fait ni l'analyse complète ni la vérification
> des types : lancer le build pour voir les erreurs de construction.

## Après un déploiement

Les PR qui ajoutent une collection ou un index le disent dans leur
description. Dans le doute, relancer ce qui suit ne coûte rien : chaque script
est idempotent.

```bash
npm run ensure:indexes            # index de la base
npm run import:celestial-bodies   # paramètres des planètes et lunes pour le NPS
npm run import:star-map           # positions des lieux pour la Star Map et le NPS
npm run mcp:smoke                 # essai du serveur MCP (MCP_URL=https://… pour la prod)
```

## Scripts

| Script | Rôle |
| --- | --- |
| `dev`, `build`, `start`, `lint` | Next.js (le build reconstruit d'abord les vues MCP, `mcp:views`) |
| `ensure:indexes` | crée ou met à jour tous les index de la base |
| `import:catalogue` | objets, armes, véhicules, ressources (RSI, Star Citizen Wiki, UEX), voir [imports.md](imports.md) |
| `import:game-data` | blueprints, factions, missions, réputations, lore, voir [imports.md](imports.md) |
| `merge:blueprints` | réunit des blueprints en double, voir [imports.md](imports.md) |
| `import:places` | catalogue des lieux du 'verse |
| `import:place-images` | photos de couverture des lieux |
| `backfill:banners` | pose une bannière aux lieux qui n'en ont pas |
| `sync:inventory-locations` | propose les lieux du catalogue comme lieux de stockage de l'inventaire |
| `import:celestial-bodies` | centre, rayon et rotation des planètes et lunes (starmap.space), pour le NPS |
| `import:star-map` | positions des lieux (starmap.space), pour la Star Map et le NPS |
| `clean:blobs` | supprime les images de lieux que plus rien ne référence |
| `mcp:smoke`, `mcp:smoke:seed` | essai de fumée du serveur MCP, et les données qu'il interroge sur une base locale |
| `mcp:views` | construit les vues interactives des outils MCP (`mcp-views/`) |

Chaque script décrit ses options en tête de son fichier, dans `scripts/`. Ils
lisent `MONGODB_URI` dans `.env.local` et s'exécutent hors de Next (`tsx`) :
aucune permission applicative n'est vérifiée, ils sont réservés aux
opérateurs.
