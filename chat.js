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
  //    pour repérer si un mot-clé a été prononcé à un moment ou un autre.
  const texteJoueurs = history
    .filter((m) => m.role === 'user')
    .map((m) => m.text || '')
    .join(' ')
    .toLowerCase();

  const fichiersDebloques = new Set();
  const themesVerrouilles = [];
  for (const [motCle, entree] of Object.entries(config.mots_cles || {})) {
    const debloque = texteJoueurs.includes(motCle.toLowerCase());
    if (debloque) {
      (entree.fichiers || []).forEach((f) => fichiersDebloques.add(f));
    } else if (entree.theme) {
      themesVerrouilles.push(entree.theme);
    }
  }

  // 2) Personnalité de base (toujours envoyée)
  let personnage = '';
  try {
    personnage = lireFichier('personnage-nosferatu.txt');
  } catch (e) {
    personnage = 'Tu es un Nosferatu méfiant et énigmatique.';
  }

  // 3) Contenu débloqué (seulement si le mot-clé a été prononcé)
  let blocsDebloques = '';
  for (const nomFichier of fichiersDebloques) {
    try {
      const contenu = lireFichier(nomFichier);
      blocsDebloques += `\n\n--- Information débloquée (${nomFichier}) ---\n${contenu}`;
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

  const instructionSysteme =
    personnage +
    blocThemesVerrouilles +
    (blocsDebloques
      ? `\n\nVoici les informations que tu es autorisé à révéler à ce stade, si la conversation s'y prête :${blocsDebloques}`
      : '');

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
