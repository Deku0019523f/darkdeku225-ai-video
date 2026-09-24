const config = require('../config');
const { escapeMarkdown, sendMarkdownSafe } = require('../utils/helpers');

async function handleHelp(bot, chatId) {
  const text =
    `ℹ️ *Aide — Darkdeku225 AI Video*\n\n` +
    `*Fonctionnement général*\n` +
    `Ce bot transforme une image que vous envoyez en une courte vidéo animée, à partir d'une description (prompt) que vous rédigez.\n\n` +
    `*Abonnement obligatoire*\n` +
    `Le service est gratuit, mais vous devez être abonné au canal ${escapeMarkdown(config.telegram.requiredChannelLink)} pour l'utiliser. Le bot vérifie réellement votre statut d'abonné, pas seulement un clic sur un bouton.\n\n` +
    `*Créer une vidéo, étape par étape*\n` +
    `1️⃣ Appuyez sur 🎬 *Créer une vidéo*\n` +
    `2️⃣ Envoyez l'image à animer\n` +
    `3️⃣ Décrivez ce qui doit se passer dans la vidéo (le prompt)\n` +
    `4️⃣ Choisissez le format : 📱 vertical, 🖥️ horizontal, ou 🤖 automatique\n` +
    `5️⃣ Choisissez un style visuel (optionnel)\n` +
    `6️⃣ Choisissez la durée (optionnel)\n` +
    `7️⃣ Vérifiez le récapitulatif puis lancez la génération\n\n` +
    `*Bien rédiger votre prompt*\n` +
    `Décrivez ce qui doit bouger (la personne, la caméra, l'environnement) et ce qui doit rester identique (identité, vêtements, composition). Une description précise donne un meilleur résultat.\n\n` +
    `*Temps de génération*\n` +
    `La génération est asynchrone et peut prendre de quelques dizaines de secondes à plusieurs minutes selon la charge.\n\n` +
    `*Cooldown*\n` +
    `Après chaque génération lancée, vous devez patienter ${config.bot.cooldownSeconds} secondes avant d'en démarrer une nouvelle. Ce délai est individuel : il ne concerne que vous.\n\n` +
    `*Problèmes courants*\n` +
    `• "Aucune clé disponible" : le service est temporairement saturé, réessayez dans quelques minutes.\n` +
    `• Génération échouée : réessayez avec une image ou un prompt différent.\n\n` +
    `*Support*\n` +
    `Utilisez le menu 🤝 *Soutien* pour me contacter ou découvrir mes autres projets.`;

  await sendMarkdownSafe(bot, chatId, text);
}

module.exports = { handleHelp };
