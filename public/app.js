(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    applyTheme();
    tg.onEvent('themeChanged', applyTheme);
  }

  function applyTheme() {
    const p = tg.themeParams || {};
    const root = document.documentElement.style;
    if (p.bg_color) root.setProperty('--bg', p.bg_color);
    if (p.text_color) root.setProperty('--text', p.text_color);
    if (p.hint_color) root.setProperty('--hint', p.hint_color);
    if (p.link_color) root.setProperty('--link', p.link_color);
    if (p.button_color) root.setProperty('--button', p.button_color);
    if (p.button_text_color) root.setProperty('--button-text', p.button_text_color);
    if (p.secondary_bg_color) root.setProperty('--secondary-bg', p.secondary_bg_color);
  }

  const initData = tg ? tg.initData : '';

  async function api(path, options) {
    const opts = options || {};
    const res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': initData
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  }

  function confirmDialog(message) {
    return new Promise((resolve) => {
      if (tg && tg.showConfirm) tg.showConfirm(message, resolve);
      else resolve(window.confirm(message));
    });
  }

  // --------------------------------------------------------------
  // Navigation
  // --------------------------------------------------------------
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  document.querySelectorAll('[data-back]').forEach((btn) => btn.addEventListener('click', handleBack));

  function handleBack() {
    const current = document.querySelector('.screen.active').id;
    if (current === 'screen-wizard' && wizardStepIndex > 0) {
      showWizardStep(wizardStepIndex - 1);
      return;
    }
    showScreen('screen-home');
    refreshHomeStatus();
  }

  // --------------------------------------------------------------
  // Écran d'accueil
  // --------------------------------------------------------------
  let currentStatus = null;

  async function refreshHomeStatus() {
    const { ok, data } = await api('/status');
    if (!ok) return;
    currentStatus = data;
    document.getElementById('home-admin-btn').hidden = !data.isAdmin;
    const note = document.getElementById('home-status-note');
    if (data.cooldownRemaining > 0) {
      note.textContent = `⏳ Prochaine génération possible dans ${data.cooldownRemaining}s`;
    } else if (!data.keysAvailable) {
      note.textContent = '❌ Service momentanément indisponible.';
    } else {
      note.textContent = '';
    }
  }

  async function init() {
    const { ok, data } = await api('/status');
    if (!ok) {
      document.getElementById('error-text').textContent =
        "❌ Impossible de contacter le serveur. Réessayez plus tard.";
      showScreen('screen-error');
      return;
    }
    currentStatus = data;
    if (!data.isMember) {
      document.getElementById('channel-join-link').href = data.channelLink;
      showScreen('screen-channel');
      return;
    }
    document.getElementById('home-admin-btn').hidden = !data.isAdmin;
    await refreshHomeStatus();
    showScreen('screen-home');
  }

  document.getElementById('channel-verify-btn').addEventListener('click', async () => {
    const { data } = await api('/membership');
    if (data && data.isMember) {
      showScreen('screen-home');
      refreshHomeStatus();
    } else if (tg && tg.showAlert) {
      tg.showAlert("Vous n'êtes pas encore abonné au canal. Rejoignez-le puis réessayez.");
    } else {
      alert("Vous n'êtes pas encore abonné au canal.");
    }
  });

  document.getElementById('home-create-btn').addEventListener('click', () => {
    resetWizard();
    showScreen('screen-wizard');
    showWizardStep(0);
  });
  document.getElementById('home-help-btn').addEventListener('click', () => {
    showScreen('screen-help');
  });
  document.getElementById('home-support-btn').addEventListener('click', () => {
    loadSupport();
    showScreen('screen-support');
  });
  document.getElementById('home-admin-btn').addEventListener('click', () => {
    showScreen('screen-admin');
    loadAdminStats();
  });

  // --------------------------------------------------------------
  // Aide
  // --------------------------------------------------------------
  document.getElementById('help-content').innerHTML = `
<strong>Fonctionnement général</strong>
Ce bot transforme une image que vous envoyez en une courte vidéo animée, à partir d'une description (prompt) que vous rédigez.

<strong>Abonnement obligatoire</strong>
Le service est gratuit, mais vous devez être abonné à notre canal officiel pour l'utiliser.

<strong>Créer une vidéo, étape par étape</strong>
1. Appuyez sur 🎬 Créer une vidéo
2. Envoyez l'image à animer
3. Décrivez ce qui doit se passer dans la vidéo
4. Choisissez le format : vertical, horizontal, ou automatique
5. Choisissez un style visuel (optionnel)
6. Choisissez la durée (optionnel)
7. Vérifiez le récapitulatif puis lancez la génération

<strong>Bien rédiger votre prompt</strong>
Décrivez ce qui doit bouger (la personne, la caméra, l'environnement) et ce qui doit rester identique (identité, vêtements, composition).

<strong>Cooldown</strong>
Après chaque génération lancée, vous devez patienter quelques secondes avant d'en démarrer une nouvelle.

<strong>Problèmes courants</strong>
"Service indisponible" : réessayez dans quelques minutes.
Génération échouée : réessayez avec une image ou un prompt différent.`;

  // --------------------------------------------------------------
  // Soutien
  // --------------------------------------------------------------
  async function loadSupport() {
    const { data } = await api('/support');
    if (!data) return;
    document.getElementById('support-info-text').textContent = data.info;
    const container = document.getElementById('support-sites');
    container.innerHTML = '';
    (data.sites || []).forEach((site) => {
      const a = document.createElement('a');
      a.className = 'btn btn-secondary';
      a.href = site.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = site.button_text || site.name;
      container.appendChild(a);
    });
  }

  // --------------------------------------------------------------
  // Wizard de création vidéo
  // --------------------------------------------------------------
  const STYLES = [
    { key: 'cinematic', label: '🎬 Cinématique' },
    { key: 'realistic', label: '📸 Réaliste' },
    { key: 'artistic', label: '🎨 Artistique' },
    { key: 'dynamic', label: '⚡ Dynamique' },
    { key: 'anime', label: '🌌 Anime' },
    { key: 'none', label: '✨ Aucun style' }
  ];
  const styleGrid = document.getElementById('style-grid');
  STYLES.forEach((s) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.dataset.style = s.key;
    btn.innerHTML = `<span>${s.label}</span>`;
    btn.addEventListener('click', () => selectStyle(s.key, s.label));
    styleGrid.appendChild(btn);
  });

  const wizardSteps = ['image', 'prompt', 'format', 'style', 'duration', 'recap'];
  let wizardStepIndex = 0;
  let wizardState = {};

  function resetWizard() {
    wizardState = { imageBase64: null, imageWidth: 0, imageHeight: 0, prompt: '', format: null, formatLabel: '', styleKey: 'none', styleLabel: '✨ Aucun style', duration: null, durationLabel: '' };
    document.getElementById('image-input').value = '';
    document.getElementById('image-preview').hidden = true;
    document.getElementById('image-next-btn').disabled = true;
    document.getElementById('prompt-input').value = '';
  }

  function showWizardStep(idx) {
    wizardStepIndex = idx;
    wizardSteps.forEach((s, i) => {
      document.getElementById('wizard-step-' + s).hidden = i !== idx;
    });
  }

  document.getElementById('image-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        wizardState.imageBase64 = reader.result;
        wizardState.imageWidth = img.width;
        wizardState.imageHeight = img.height;
        const preview = document.getElementById('image-preview');
        preview.src = reader.result;
        preview.hidden = false;
        document.getElementById('image-next-btn').disabled = false;
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('image-next-btn').addEventListener('click', () => showWizardStep(1));

  document.getElementById('prompt-next-btn').addEventListener('click', () => {
    const val = document.getElementById('prompt-input').value.trim();
    if (!val) {
      if (tg && tg.showAlert) tg.showAlert("Merci d'écrire une description.");
      else alert("Merci d'écrire une description.");
      return;
    }
    wizardState.prompt = val;
    showWizardStep(2);
  });

  document.querySelectorAll('#wizard-step-format .choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      wizardState.format = btn.dataset.format;
      wizardState.formatLabel = btn.textContent.trim();
      showWizardStep(3);
    });
  });

  function selectStyle(key, label) {
    wizardState.styleKey = key;
    wizardState.styleLabel = label;
    showWizardStep(4);
  }

  document.querySelectorAll('#wizard-step-duration .choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      wizardState.duration = btn.dataset.duration;
      wizardState.durationLabel = btn.textContent.trim();
      fillRecap();
      showWizardStep(5);
    });
  });

  function fillRecap() {
    document.getElementById('recap-image').src = wizardState.imageBase64;
    document.getElementById('recap-prompt').textContent = wizardState.prompt;
    document.getElementById('recap-format').textContent = wizardState.formatLabel;
    document.getElementById('recap-style').textContent = wizardState.styleLabel;
    document.getElementById('recap-duration').textContent = wizardState.durationLabel;
  }

  document.getElementById('recap-edit-btn').addEventListener('click', () => showWizardStep(4));
  document.getElementById('recap-cancel-btn').addEventListener('click', () => {
    showScreen('screen-home');
    refreshHomeStatus();
  });

  document.getElementById('recap-generate-btn').addEventListener('click', async () => {
    showScreen('screen-generating');
    document.getElementById('generating-text').textContent = '⏳ Préparation de votre vidéo...';

    const { ok, status, data } = await api('/video/generate', {
      method: 'POST',
      body: {
        imageBase64: wizardState.imageBase64,
        prompt: wizardState.prompt,
        format: wizardState.format,
        style: wizardState.styleKey,
        duration: wizardState.duration,
        imageWidth: wizardState.imageWidth,
        imageHeight: wizardState.imageHeight
      }
    });

    if (!ok) {
      if (status === 403 && data && data.error === 'channel_required') {
        document.getElementById('channel-join-link').href = data.channelLink;
        showScreen('screen-channel');
        return;
      }
      if (status === 429) {
        showError(`⏳ Vous devez patienter encore ${data.remaining} seconde(s) avant de lancer une nouvelle génération.`);
        return;
      }
      showError('❌ Le service est momentanément indisponible (aucune clé API active).\nVeuillez réessayer dans quelques instants.');
      return;
    }

    pollJob(data.jobId);
  });

  function showError(message) {
    document.getElementById('error-text').textContent = message;
    showScreen('screen-error');
  }
  document.getElementById('error-home-btn').addEventListener('click', () => {
    showScreen('screen-home');
    refreshHomeStatus();
  });

  function pollJob(jobId) {
    const interval = setInterval(async () => {
      const { ok, data } = await api('/video/job/' + jobId);
      if (!ok || !data) return;

      let text = '🎬 Génération en cours...';
      if (data.status === 'queued') text = "⏳ Votre vidéo est en file d'attente...";
      if (typeof data.progress === 'number') text += `\n\nProgression : ${Math.round(data.progress)} %`;
      document.getElementById('generating-text').textContent = text;

      if (data.status === 'completed') {
        clearInterval(interval);
        document.getElementById('result-video').src = data.videoUrl;
        const adBox = document.getElementById('result-ad');
        if (data.ad) {
          adBox.hidden = false;
          adBox.innerHTML = `${data.ad.image ? `<img src="${data.ad.image}" />` : ''}<p>${data.ad.message}</p>${data.ad.url ? `<a class="btn btn-secondary" href="${data.ad.url}" target="_blank" rel="noopener">${data.ad.button_text || 'En savoir plus'}</a>` : ''}`;
        } else {
          adBox.hidden = true;
        }
        showScreen('screen-result');
      } else if (data.status === 'failed') {
        clearInterval(interval);
        showError('❌ La génération n\'a pas pu être terminée.\n\nNotre service vidéo rencontre actuellement un problème.\nVeuillez réessayer dans quelques instants.');
      }
    }, 2500);
  }

  document.getElementById('result-new-btn').addEventListener('click', () => {
    resetWizard();
    showScreen('screen-wizard');
    showWizardStep(0);
  });

  // --------------------------------------------------------------
  // Admin
  // --------------------------------------------------------------
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.admin-tab-content').forEach((c) => (c.hidden = true));
      const tab = btn.dataset.tab;
      document.getElementById('admin-tab-' + tab).hidden = false;
      if (tab === 'stats') loadAdminStats();
      if (tab === 'keys') loadAdminKeys();
      if (tab === 'ads') loadAdminAds();
      if (tab === 'support') loadAdminSupport();
    });
  });

  async function loadAdminStats() {
    const { data } = await api('/admin/stats');
    if (!data) return;
    const v = data.videoStats;
    const a = data.apiStats;
    document.getElementById('admin-stats-box').innerHTML = `
<strong>👥 Utilisateurs</strong>
Total : ${v.users.total} — Nouveaux aujourd'hui : ${v.users.newToday}
Actifs aujourd'hui : ${v.users.activeToday} — semaine : ${v.users.activeWeek} — mois : ${v.users.activeMonth}

<strong>🎬 Vidéos</strong>
Total : ${v.videos.total} — Aujourd'hui : ${v.videos.today} — Semaine : ${v.videos.week} — Mois : ${v.videos.month}
✅ Réussies : ${v.videos.success} — ❌ Échouées : ${v.videos.failed} — ⏳ En cours : ${v.videos.pending}
${v.videos.successRate !== null ? `📈 Taux de réussite : ${Math.round(v.videos.successRate)}%` : ''}
${v.videos.avgGenerationSeconds !== null ? `⏱️ Temps moyen de génération : ${v.videos.avgGenerationSeconds}s` : ''}

<strong>🔑 API</strong>
Total : ${a.total} — Disponibles : ${a.available} — Limitées : ${a.limited} — Désactivées : ${a.disabled}`;
  }

  async function loadAdminKeys() {
    const { data } = await api('/admin/keys');
    const container = document.getElementById('keys-list');
    container.innerHTML = '';
    (data || []).forEach((k) => {
      const icon = k.status === 'active' ? '🟢' : k.status === 'limited' ? '🟠' : '🔴';
      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `<div class="row"><span>${icon} #${k.id} ${k.masked_key}</span>
        <div class="row-actions"><button data-delete-key="${k.id}">🗑</button></div></div>
        <div>Utilisations : ${k.usage_count} · Succès : ${k.success_count} · Erreurs : ${k.error_count} · Limites : ${k.rate_limit_count}</div>`;
      container.appendChild(div);
    });
    container.querySelectorAll('[data-delete-key]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await confirmDialog('Supprimer cette clé API ?');
        if (!ok) return;
        await api('/admin/keys/' + btn.dataset.deleteKey, { method: 'DELETE' });
        loadAdminKeys();
      });
    });
  }

  document.getElementById('key-add-btn').addEventListener('click', async () => {
    const input = document.getElementById('key-input');
    const val = input.value.trim();
    if (!val) return;
    const { ok, data } = await api('/admin/keys', { method: 'POST', body: { key: val } });
    if (!ok) {
      if (tg && tg.showAlert) tg.showAlert(data.error || 'Erreur.');
      else alert(data.error || 'Erreur.');
      return;
    }
    input.value = '';
    loadAdminKeys();
  });

  async function loadAdminAds() {
    const { data } = await api('/admin/ads');
    const container = document.getElementById('ads-list');
    container.innerHTML = '';
    (data || []).forEach((ad) => {
      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `<div class="row"><span>${ad.active ? '🟢' : '🔴'} #${ad.id} ${ad.message.slice(0, 40)}</span>
        <div class="row-actions">
          <button data-toggle-ad="${ad.id}" data-active="${ad.active}">${ad.active ? 'Désactiver' : 'Activer'}</button>
          <button data-delete-ad="${ad.id}">🗑</button>
        </div></div>`;
      container.appendChild(div);
    });
    container.querySelectorAll('[data-toggle-ad]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await api('/admin/ads/' + btn.dataset.toggleAd, {
          method: 'PATCH',
          body: { active: btn.dataset.active !== '1' }
        });
        loadAdminAds();
      });
    });
    container.querySelectorAll('[data-delete-ad]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await confirmDialog('Supprimer cette publicité ?');
        if (!ok) return;
        await api('/admin/ads/' + btn.dataset.deleteAd, { method: 'DELETE' });
        loadAdminAds();
      });
    });
  }

  document.getElementById('ad-add-btn').addEventListener('click', async () => {
    const message = document.getElementById('ad-message').value.trim();
    const url = document.getElementById('ad-url').value.trim();
    const buttonText = document.getElementById('ad-button').value.trim();
    if (!message) return;
    const { ok, data } = await api('/admin/ads', {
      method: 'POST',
      body: { message, url: url || undefined, buttonText: buttonText || undefined }
    });
    if (!ok) {
      if (tg && tg.showAlert) tg.showAlert(data.error || 'Erreur.');
      return;
    }
    document.getElementById('ad-message').value = '';
    document.getElementById('ad-url').value = '';
    document.getElementById('ad-button').value = '';
    loadAdminAds();
  });

  async function loadAdminSupport() {
    const { data } = await api('/admin/support');
    if (!data) return;
    document.getElementById('support-info-input').value = data.info;
    const container = document.getElementById('sites-list');
    container.innerHTML = '';
    (data.sites || []).forEach((site) => {
      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `<div class="row"><span>${site.active ? '🟢' : '🔴'} ${site.name}</span>
        <div class="row-actions">
          <button data-toggle-site="${site.id}" data-active="${site.active}">${site.active ? 'Désactiver' : 'Activer'}</button>
          <button data-delete-site="${site.id}">🗑</button>
        </div></div>
        <div>${site.url}</div>`;
      container.appendChild(div);
    });
    container.querySelectorAll('[data-toggle-site]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await api('/admin/support/sites/' + btn.dataset.toggleSite, {
          method: 'PATCH',
          body: { active: btn.dataset.active !== '1' }
        });
        loadAdminSupport();
      });
    });
    container.querySelectorAll('[data-delete-site]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await confirmDialog('Supprimer ce site ?');
        if (!ok) return;
        await api('/admin/support/sites/' + btn.dataset.deleteSite, { method: 'DELETE' });
        loadAdminSupport();
      });
    });
  }

  document.getElementById('support-info-save-btn').addEventListener('click', async () => {
    const text = document.getElementById('support-info-input').value.trim();
    if (!text) return;
    await api('/admin/support/info', { method: 'PUT', body: { text } });
    if (tg && tg.showAlert) tg.showAlert('Informations mises à jour.');
  });

  document.getElementById('site-add-btn').addEventListener('click', async () => {
    const name = document.getElementById('site-name').value.trim();
    const url = document.getElementById('site-url').value.trim();
    const description = document.getElementById('site-description').value.trim();
    const buttonText = document.getElementById('site-button').value.trim();
    if (!name || !url) return;
    const { ok, data } = await api('/admin/support/sites', {
      method: 'POST',
      body: { name, url, description: description || undefined, buttonText: buttonText || undefined }
    });
    if (!ok) {
      if (tg && tg.showAlert) tg.showAlert(data.error || 'Erreur.');
      return;
    }
    document.getElementById('site-name').value = '';
    document.getElementById('site-url').value = '';
    document.getElementById('site-description').value = '';
    document.getElementById('site-button').value = '';
    loadAdminSupport();
  });

  init();
})();
