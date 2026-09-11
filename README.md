# Development

## Setup

- Pull mongo image through podman

```bash
podman pull docker.io/library/mongo
```

- Start a mongodb database

```bash
podman run --name mongo -d -p 27017:27017 mongo
```

### Environment variables

Create a `.env.local` file and add the environment variables.

```bash
touch .env.local
```

```
BETTER_AUTH_SECRET="" # openssl rand -base64 32
MONGODB_URI="mongodb://localhost:27017" # MongoDB connection string
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
