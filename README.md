# Prestivo — Site + Backend + Dashboard (déploiement unique)

Ce projet contient **tout en un** : le site vitrine, l'API de commandes et le
dashboard admin. Un seul déploiement, une seule URL, aucun lien vers Discord.

## Structure

```
prestivo/
  server.js          → serveur Express (API + fichiers statiques)
  store.js           → stockage des commandes (fichier JSON)
  public/
    index.html        → le site vitrine (page d'accueil)
    style.css
    script.js
    images/            → logo, favicons, photos produits
    login.html         → connexion admin
    dashboard.html     → gestion des commandes
    admin.css
```

Quand quelqu'un visite ton domaine :
- `/` → le site vitrine
- `/login` → connexion admin
- `/dashboard` → gestion des commandes (protégé, redirige vers `/login` si non connecté)
- `/api/order` → reçoit les commandes du formulaire (public)
- `/api/orders`, `/api/stats`, etc. → réservés au dashboard (protégés)

## Installation

```bash
npm install
cp .env.example .env
```

Ouvre `.env` et modifie au minimum :

- `ADMIN_EMAIL` → ton email de connexion au dashboard
- `ADMIN_PASSWORD_HASH` → génère ton propre hash (voir ci-dessous), **ne garde pas le mot de passe par défaut**
- `JWT_SECRET` → une longue chaîne aléatoire et privée

`FRONTEND_ORIGIN` peut rester vide : le site et l'API sont sur le même
domaine, donc pas besoin de configuration CORS particulière.

### Changer le mot de passe admin

```bash
node generate-hash.js "MonNouveauMotDePasse"
```

Copie le hash affiché dans `ADMIN_PASSWORD_HASH` du fichier `.env`.

**Identifiants par défaut (à changer immédiatement) :**
- Email : `admin@prestivo.ma`
- Mot de passe : `changeme123`

## Lancer en local

```bash
npm start
```

Puis ouvre `http://localhost:3000` (site) et `http://localhost:3000/dashboard` (admin).

## Déploiement (Railway ou équivalent)

1. Pousse ce dossier sur un dépôt Git.
2. Crée un projet Railway à partir du repo.
3. Ajoute les variables d'environnement du `.env` dans les "Variables" du projet Railway.
4. Railway détecte automatiquement `npm start`.
5. C'est tout — une seule URL sert le site ET le dashboard.

⚠️ **Important** : `data/orders.json` est stocké sur le disque du serveur.
Sur certains hébergeurs (dont Railway en plan gratuit), le disque peut être
réinitialisé à chaque redéploiement. Pour une utilisation en production
sérieuse, il est recommandé de brancher une vraie base de données plus tard
(PostgreSQL par exemple) — la structure du fichier `store.js` est conçue
pour être facilement remplaçable.

## Sécurité

- Mots de passe hashés avec bcrypt (jamais stockés en clair)
- Sessions via cookie `httpOnly` + JWT signé
- Limitation de débit basique sur `/api/order` (anti-spam) et `/api/login` (anti brute-force)
