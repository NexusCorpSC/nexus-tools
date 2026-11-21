# Connexion de Nexus App

Nexus App n'a pas de formulaire de connexion : il ouvre `/desktop/connect` dans
le navigateur et attend sur un port de la boucle locale (redirection loopback,
RFC 8252). Le code vit dans `lib/desktop-auth.ts` et
`app/desktop/connect/page.tsx`.

```
GET /desktop/connect?port=<1024-65535>&state=<16-128 car.>&challenge=<S256>
  non connecté → /login?callbackUrl=<cette URL>, qui y revient
  connecté     → 302 http://127.0.0.1:<port>/callback?code=<code>&state=<state>

POST /api/auth/desktop/exchange   { code, verifier }
  200  Set-Cookie: <session better-auth>   { id, name, email, image }
  400  code inconnu, expiré, déjà utilisé, ou verifier qui ne correspond pas
```

- **Le code est à usage unique et vit deux minutes.** Il est stocké haché dans
  la table de vérification de better-auth, et supprimé au premier échange,
  réussi ou non.
- **PKCE (RFC 7636).** `challenge` est le SHA-256 en base64url d'un secret que
  l'application garde et ne donne qu'à l'échange : un autre programme qui
  intercepterait la redirection n'aurait que le code.
- **La redirection ne vise que `127.0.0.1`** : un lien vers la page ne peut
  envoyer le code que sur la machine de celui qui clique.
- **L'échange crée une session propre à l'application**, distincte de celle du
  navigateur : se déconnecter de l'une ne déconnecte pas l'autre.

