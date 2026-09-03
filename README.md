# SchreckNet — guide de mise en ligne

Aucune commande à taper. Tout se fait dans le navigateur.

## Étape 1 — Mettre les fichiers sur GitHub

1. Va sur ton dépôt GitHub (vide).
2. Bouton **"Add file" > "Upload files"**.
3. Glisse-dépose TOUS les fichiers et dossiers de ce projet (`index.html`, `config.json`, `package.json`, le dossier `api/`, le dossier `contenu/`) en gardant la même structure.
4. En bas de page : **"Commit changes"**.

## Étape 2 — Connecter Vercel

1. Sur [vercel.com](https://vercel.com), **"Add New" > "Project"**.
2. Choisis ton dépôt GitHub SchreckNet.
3. Ne change aucun réglage (Vercel détecte tout seul qu'il n'y a rien de spécial à configurer).
4. **Avant de cliquer "Deploy"** : dépli "Environment Variables" et ajoute :
   - Name : `GEMINI_API_KEY`
   - Value : ta clé API Gemini
5. Clique **"Deploy"**.

Au bout d'une minute, Vercel te donne une URL du style `schrecknet.vercel.app`. C'est le lien à donner à tes joueurs.

## Étape 3 — Personnaliser avant la partie

Tout se modifie directement sur github.com (icône crayon sur chaque fichier), pas besoin de re-télécharger quoi que ce soit :

- **`contenu/personnage-nosferatu.txt`** : la personnalité du PNJ. À écrire une bonne fois pour toutes.
- **`contenu/pnj-notoires-chicago.txt`**, **`historique-mascarade.txt`**, **`indices-joueurs.txt`** : le contenu réel de ton scénario, à la place des placeholders.
- **`config.json`** : deux catégories désormais.
  - `fichiers_toujours_connus` : du lore que le Nosferatu connaît en permanence (PNJ, histoire de la ville) — jamais verrouillé, il peut en parler s'il le choisit.
  - `mots_cles` : les vrais secrets (les indices d'enquête), verrouillés tant que le mot-clé n'a pas été prononcé par un joueur. C'est LE réglage que tu changeras entre deux sessions. Chaque entrée a un `theme` (description courte, toujours visible par l'IA) et des `fichiers` (le contenu réel).
  Pour ajouter un nouveau sujet verrouillé : duplique un bloc dans `mots_cles`. Pour ajouter du lore libre : ajoute juste le nom du fichier dans `fichiers_toujours_connus`. Aucun code à toucher dans les deux cas.
  - `commandes_regles` : des raccourcis exacts (ex : "regle combat" → renvoie le texte de `contenu/regles/combat.txt` tel quel, sans que l'IA improvise un chiffre). Taper juste "regle" (ou "regles") tout seul liste automatiquement toutes les commandes disponibles — généré depuis ce fichier, donc toujours à jour sans rien à maintenir ailleurs. Pour ajouter une règle : dépose un `.txt` dans `contenu/regles/`, ajoute une ligne `"regle xxx": "regles/xxx.txt"` dans `commandes_regles`.

Chaque modification sur GitHub relance automatiquement une mise en ligne sur Vercel (~1 minute, visible dans l'onglet "Deployments" de Vercel).

## Comment ça marche, en une phrase

Le site n'envoie à l'IA que les fichiers dont le mot-clé a été prononcé par un joueur depuis le début de la conversation — les autres fichiers ne quittent jamais le serveur, donc impossible pour un joueur de les faire "sortir" par la ruse.

## Si quelque chose casse

- **Le site répond "Clé API Gemini manquante"** → la variable d'environnement n'est pas configurée sur Vercel (Project > Settings > Environment Variables), ou il faut redéployer après l'avoir ajoutée (bouton "Redeploy" dans l'onglet Deployments).
- **Le site répond "Erreur de l'API Gemini"** → regarde le message précis, en général une clé invalide ou un quota dépassé.
- **Un mot-clé ne débloque rien** → vérifie qu'il est écrit à l'identique (sans accent piégeur) dans `config.json` ET dans ce que le joueur a tapé ; la comparaison se fait en minuscules mais ignore les fautes de frappe.

## Ce qu'il ne faut PAS faire

Ne demande pas à un assistant de coder (Copilot ou autre) de "améliorer" ou "refactoriser" plusieurs fichiers à la fois sans comprendre ce qu'il change. Si tu veux une modification, décris-la fichier par fichier, et vérifie que le site fonctionne encore après chaque changement avant d'en faire un autre.
