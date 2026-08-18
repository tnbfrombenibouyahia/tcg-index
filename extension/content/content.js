/**
 * CardQuant -- panneau latéral coulissant sur les annonces eBay (page item
 * individuelle, cf. manifest.json content_scripts.matches). Strictement
 * additif : n'ajoute qu'un seul noeud (#cardquant-root) au DOM de la page
 * hôte, ne modifie ni ne masque rien d'existant (cf. tcg-index-handoff.md
 * §09 -- règle anti "ad injection"/"deceptive install" du Chrome Web Store).
 *
 * Sélecteurs DOM eBay best-effort, même philosophie que le reste du
 * scraping de ce repo (cf. ingestion/sources/*) : eBay change son markup
 * sans préavis, à ajuster ici si le panneau reste vide sur une annonce.
 *
 * "Compte requis avant toute utilisation" (§01/§09) : le panneau exige une
 * session (cf. lib/auth.js, relayée par background.js -- chrome.identity
 * n'est pas accessible depuis un content script) avant d'appeler
 * pricing_api. Aucune vérification côté serveur pour l'instant : la
 * gate est uniquement client -- cf. TODO dans extension/README.md.
 */
(function () {
  const TITLE_SELECTORS = ["h1.x-item-title__mainTitle span.ux-textspans", "h1.x-item-title__mainTitle"];
  const PRICE_SELECTORS = [".x-price-primary .ux-textspans", "#prcIsum", "#mm-saleDscPrc"];

  const VERDICT_LABELS = { green: "Bonne affaire", yellow: "Prix normal", red: "Survendu" };

  function queryFirstText(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return null;
  }

  function parsePrice(raw) {
    if (!raw) return null;
    // "US $12.99", "12,99 EUR", ... -- retire les séparateurs de milliers,
    // prend le dernier nombre plausible (évite de capter un "1" isolé
    // appartenant au symbole monétaire plutôt qu'au montant).
    const matches = raw.replace(/,/g, "").match(/\d+\.?\d*/g);
    if (!matches) return null;
    const value = parseFloat(matches[matches.length - 1]);
    return Number.isFinite(value) ? value : null;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function sendMessage(message) {
    return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
  }

  function buildPanel() {
    const root = document.createElement("div");
    root.id = "cardquant-root";

    const tab = document.createElement("button");
    tab.id = "cardquant-tab";
    tab.type = "button";
    tab.setAttribute("aria-label", "Ouvrir CardQuant");
    tab.textContent = "CQ";

    const card = document.createElement("div");
    card.id = "cardquant-card";
    card.innerHTML = '<div id="cardquant-body">Chargement…</div>';

    root.append(tab, card);

    let open = false;
    function setOpen(next) {
      open = next;
      root.classList.toggle("cardquant-open", open);
    }
    tab.addEventListener("click", () => setOpen(!open));

    const body = () => card.querySelector("#cardquant-body");

    return {
      root,
      toggle: () => setOpen(!open),
      setOpen,
      onClick(selector, handler) {
        card.addEventListener("click", (e) => {
          if (e.target.closest(selector)) handler();
        });
      },
      setError(message) {
        body().innerHTML = `<p class="cardquant-error">${escapeHtml(message)}</p>`;
      },
      setSignedOut(errorMessage) {
        tab.classList.remove("cardquant-green", "cardquant-yellow", "cardquant-red");
        body().innerHTML = `
          <p>Connexion Google requise avant de voir le verdict d'une annonce.</p>
          ${errorMessage ? `<p class="cardquant-error">${escapeHtml(errorMessage)}</p>` : ""}
          <button type="button" class="cardquant-signin">Se connecter avec Google</button>
        `;
      },
      setVerdict(data) {
        setOpen(true);
        tab.classList.remove("cardquant-green", "cardquant-yellow", "cardquant-red");
        if (data.verdict) tab.classList.add(`cardquant-${data.verdict}`);
        body().innerHTML = renderVerdict(data);
      },
    };
  }

  function renderVerdict(data) {
    const footer = '<button type="button" class="cardquant-signout">Se déconnecter</button>';
    if (data.status === "ambiguous") {
      return `<p>Plusieurs cartes possibles (${data.candidates.length}) — identification manuelle nécessaire.</p>${footer}`;
    }
    if (data.status !== "matched" || !data.card) {
      return `<p>${escapeHtml(data.message || "Carte non identifiée.")}</p>${footer}`;
    }
    const label = VERDICT_LABELS[data.verdict] || data.verdict || "—";
    const ref = data.reference_price != null ? `${data.reference_price.toFixed(2)} $` : "—";
    const displayed = data.displayed_price != null ? `${data.displayed_price.toFixed(2)} $` : "—";
    return `
      <p class="cardquant-card-name">${escapeHtml(data.card.name)}${data.card.code ? " · " + escapeHtml(data.card.code) : ""}</p>
      <p class="cardquant-verdict-label">${escapeHtml(label)}</p>
      <dl>
        <dt>Prix annonce</dt><dd>${displayed}</dd>
        <dt>Prix de référence</dt><dd>${ref}</dd>
      </dl>
      <p class="cardquant-todo">ROI gradation, liquidité et calculateur d'arbitrage : à venir (cf. extension/README.md).</p>
      ${footer}
    `;
  }

  async function requestVerdict(panel) {
    const title = queryFirstText(TITLE_SELECTORS);
    const displayedPrice = parsePrice(queryFirstText(PRICE_SELECTORS));

    if (!title || displayedPrice == null) {
      panel.setError("Titre ou prix introuvable sur cette page (sélecteurs à ajuster ?).");
      return;
    }

    const response = await sendMessage({ type: "CARDQUANT_GET_VERDICT", text: title, displayedPrice });
    if (!response || !response.ok) {
      if (response?.reason === "auth") {
        panel.setSignedOut("Session expirée, reconnecte-toi.");
        return;
      }
      panel.setError("Verdict indisponible (pricing_api injoignable).");
      return;
    }
    panel.setVerdict(response.data);
  }

  async function refresh(panel) {
    const { session } = (await sendMessage({ type: "CARDQUANT_GET_SESSION" })) || {};
    if (!session) {
      panel.setSignedOut();
      return;
    }
    await requestVerdict(panel);
  }

  const panel = buildPanel();
  document.documentElement.appendChild(panel.root);

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "CARDQUANT_TOGGLE_PANEL") panel.toggle();
  });

  panel.onClick(".cardquant-signin", async () => {
    panel.setOpen(true);
    const result = await sendMessage({ type: "CARDQUANT_SIGN_IN" });
    if (!result || !result.ok) {
      panel.setSignedOut(result?.error || "Connexion impossible.");
      return;
    }
    await requestVerdict(panel);
  });

  panel.onClick(".cardquant-signout", async () => {
    await sendMessage({ type: "CARDQUANT_SIGN_OUT" });
    panel.setSignedOut();
  });

  refresh(panel);
})();
