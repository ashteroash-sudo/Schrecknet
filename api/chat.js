const fs = require('fs');
const path = require('path');

function lireFichier(nomRelatif) {
  const chemin = path.join(process.cwd(), 'contenu', nomRelatif);
  return fs.readFileSync(chemin, 'utf8');
}

function lireConfig() {
  const chemin = path.join(process.cwd(), 'config.json');
  return JSON.parse(fs.readFileSync(chemin, 'utf8'));
}

// Met en minuscules ET retire les accents, pour que "regle humanite" et
// "règle Humanité" soient reconnus comme identiques.
function normaliser(texte) {
  return (texte || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ erreur: 'Méthode non autorisée.' });
    return;
  }

  const cleApi = process.env.GEMINI_API_KEY;
  if (!cleApi) {
    res.status(500).json({
      erreur:
        "Clé API Gemini manquante côté serveur. Sur Vercel : Settings > Environment Variables > ajouter GEMINI_API_KEY, puis redéployer.",
    });
    return;
  }

  let config;
  try {
    config = lireConfig();
  } catch (e) {
    res.status(500).json({ erreur: 'config.json introuvable ou invalide.' });
    return;
  }

  const { history } = req.body || {};
  if (!Array.isArray(history) || history.length === 0) {
    res.status(400).json({ erreur: 'Historique de conversation manquant.' });
    return;
  }

  // 1) On rassemble tout ce que les joueurs ont tapé depuis le début de la session,
  //    pour repérer si un mot-clé secret a été prononcé à un moment ou un autre.
  const texteJoueurs = normaliser(
    history
      .filter((m) => m.role === 'user')
      .map((m) => m.text || '')
      .join(' ')
  );

  const fichiersDebloques = new Set();
  const themesVerrouilles = [];
  for (const [motCle, entree] of Object.entries(config.mots_cles || {})) {
    const debloque = texteJoueurs.includes(normaliser(motCle));
    if (debloque) {
      (entree.fichiers || []).forEach((f) => fichiersDebloques.add(f));
    } else if (entree.theme) {
      themesVerrouilles.push(entree.theme);
    }
  }

  // 1bis) Commandes de règles : uniquement recherchées dans le DERNIER message du
  //       joueur (pas tout l'historique), et sans effet de gatekeeping — juste
  //       un renvoi direct et fidèle du texte de règle demandé.
  const dernierMessageJoueur = [...history].reverse().find((m) => m.role === 'user');
  const texteDernierMessage = normaliser(dernierMessageJoueur ? dernierMessageJoueur.text : '');

  const fichiersReglesDemandes = new Set();
  for (const [commande, fichier] of Object.entries(config.commandes_regles || {})) {
    if (texteDernierMessage.includes(normaliser(commande))) {
      fichiersReglesDemandes.add(fichier);
    }
  }

  // Si le joueur tape juste "regle" ou "regles" (rien d'autre), on lui donne
  // la liste des commandes existantes plutôt qu'une règle précise.
  const demandeListeRegles =
    texteDernierMessage === normaliser('regle') || texteDernierMessage === normaliser('regles');

  // 2) Personnalité de base (toujours envoyée)
  let personnage = '';
  try {
    personnage = lireFichier('personnage-nosferatu.txt');
  } catch (e) {
    personnage = 'Tu es un Nosferatu méfiant et énigmatique.';
  }

  // 2bis) Lore toujours connu (jamais verrouillé, à distinguer des vrais secrets)
  let blocsConnus = '';
  for (const nomFichier of config.fichiers_toujours_connus || []) {
    try {
      const contenu = lireFichier(nomFichier);
      blocsConnus += `\n\n--- Connaissance de fond (${nomFichier}) ---\n${contenu}`;
    } catch (e) {
      // fichier manquant : on l'ignore silencieusement, pas de crash
    }
  }

  // 3) Contenu débloqué (seulement si le mot-clé secret a été prononcé)
  let blocsDebloques = '';
  for (const nomFichier of fichiersDebloques) {
    try {
      const contenu = lireFichier(nomFichier);
      blocsDebloques += `\n\n--- Information débloquée (${nomFichier}) ---\n${contenu}`;
    } catch (e) {
      // fichier manquant : on l'ignore silencieusement, pas de crash
    }
  }

  // 3bis) Règle(s) demandée(s) explicitement dans le dernier message
  let blocsRegles = '';
  for (const nomFichier of fichiersReglesDemandes) {
    try {
      const contenu = lireFichier(nomFichier);
      blocsRegles += `\n\n--- Règle demandée (${nomFichier}) ---\n${contenu}`;
    } catch (e) {
      // fichier manquant : on l'ignore silencieusement, pas de crash
    }
  }

  const blocThemesVerrouilles =
    themesVerrouilles.length > 0
      ? `\n\nSujets sensibles NON débloqués pour l'instant (tu sais qu'ils existent, mais tu n'en connais pas le contenu tant qu'ils ne sont pas débloqués ci-dessous) :\n` +
        themesVerrouilles.map((t) => `- ${t}`).join('\n') +
        `\nSi une question touche un de ces sujets, ne dis jamais platement "je ne sais pas" : élude, marchande, réclame quelque chose en échange, ou détourne la conversation à ta manière — reste en personnage. Pour tout le reste (questions générales sur le monde, PNJ notoires publics, ambiance, etc.), tu réponds librement.`
      : '';

  const instructionRegles = blocsRegles
    ? `\n\nUne règle précise du jeu est demandée. Pour cette réponse uniquement : réponds de façon CLAIRE et FIDÈLE au texte fourni ci-dessous, sans arrondir ni modifier un seul chiffre. Tu peux garder une pointe de ta voix habituelle, mais la clarté prime largement sur le personnage cette fois-ci. Termine si pertinent par une note du style "...pour le reste, mon petit, c'est ton conteur qui décide.". Voici le texte de règle exact :${blocsRegles}`
    : demandeListeRegles
    ? `\n\nLe joueur demande la liste des commandes de règles disponibles. Pour cette réponse uniquement, réponds de façon claire (tu peux garder une pointe de ta voix, mais la lisibilité prime) en listant CES commandes exactes, une par ligne, sans en inventer d'autres ni en oublier :\n` +
      Object.keys(config.commandes_regles || {})
        .map((c) => `- "${c}"`)
        .join('\n')
    : '';

  const instructionSysteme =
    personnage +
    (blocsConnus
      ? `\n\nVoici des connaissances de fond que tu maîtrises déjà et dont tu peux parler librement, à ta manière (tu peux rester évasif par nature, mais rien ne t'empêche techniquement d'en parler) :${blocsConnus}`
      : '') +
    blocThemesVerrouilles +
    (blocsDebloques
      ? `\n\nVoici les informations que tu es autorisé à révéler à ce stade, si la conversation s'y prête :${blocsDebloques}`
      : '') +
    instructionRegles;

  // 4) On construit la conversation pour Gemini (uniquement les tours user/model)
  const contents = history
    .filter((m) => m.role === 'user' || m.role === 'model')
    .map((m) => ({
      role: m.role,
      parts: [{ text: m.text || '' }],
    }));

  const modele = config.modele_gemini || 'gemini-3.6-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent`;

  try {
    const reponseGemini = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': cleApi,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: instructionSysteme }] },
        contents,
        generationConfig: {
          thinkingConfig: { thinkingLevel: config.niveau_reflexion || 'low' },
        },
      }),
    });

    const donnees = await reponseGemini.json();

    if (!reponseGemini.ok) {
      res.status(502).json({
        erreur: `Erreur de l'API Gemini : ${donnees?.error?.message || reponseGemini.status}`,
      });
      return;
    }

    const texte =
      donnees?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ||
      '... (silence. le réseau ne répond pas.)';

    res.status(200).json({ reply: texte });
  } catch (e) {
    res.status(500).json({ erreur: `Erreur serveur : ${e.message}` });
  }
};
