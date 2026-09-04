/**
 * CardQuant -- panneau latéral coulissant sur les annonces eBay (page item
 * individuelle, cf. manifest.json content_scripts.matches). Strictement
 * additif : n'ajoute qu'un seul noeud (#cardquant-root) au DOM de la page
 * hôte, ne modifie ni ne masque rien d'existant (cf. tcg-index-handoff.md
 * §09 -- règle anti "ad injection"/"deceptive install" du Chrome Web Store).
 *
 * Habillage visuel aligné sur "CardQuant Panel" (design system Slabline, cf.
 * mémoire projet "cardquant-rebrand") -- même vocabulaire/mêmes couleurs que
 * le Terminal (web/), mais toujours en JS/CSS vanille : ce fichier n'a ni
 * bundler ni React (cf. extension/README.md), les composants du Terminal ne
 * sont donc jamais importés ici, seulement leur apparence reproduite à la
 * main (panel.css, tokens --cq-* recopiés en dur depuis
 * web/styles/cardquant/tokens/colors.css -- un content script ne peut pas
 * hériter des custom properties de tcgindex.vercel.app).
 *
 * Sélecteurs DOM eBay best-effort, même philosophie que le reste du
 * scraping de ce repo (cf. ingestion/sources/*) : eBay change son markup
 * sans préavis, à ajuster ici si le panneau reste vide sur une annonce.
 *
 * "Compte requis avant toute utilisation" (§01/§09) : le panneau exige une
 * session avant d'appeler pricing_api (vérifiée aussi côté serveur, cf.
 * pricing/auth.py). La connexion se fait sur le site (tcgindex.vercel.app),
 * pas ici -- "Se connecter" ouvre un onglet ; une fois connecté là-bas, la
 * session est relayée à l'extension (cf. background.js) et ce panneau se
 * met à jour tout seul (chrome.storage.onChanged ci-dessous), sans qu'il
 * faille revenir cliquer sur cet onglet.
 *
 * Frontière contrat/DOM (cf. discussion "feedback technique agents") : ce
 * fichier capte UNIQUEMENT ce qui est sur la page (titre, prix affiché,
 * grade détecté) + un fallback utilisateur (select de grade). Score
 * d'opportunité, moy. ventes, liquidité, comparaison par langue, prix du
 * display scellé, population par note, divergence prix/volume,
 * positionnement dans le set viennent TOUJOURS de la réponse /verdict
 * (pricing_api) -- jamais recalculés ni inventés ici, cf.
 * pricing_api/schemas.py pour le contrat exact.
 */
(function () {
  const TITLE_SELECTORS = ["h1.x-item-title__mainTitle span.ux-textspans", "h1.x-item-title__mainTitle"];
  const PRICE_SELECTORS = [".x-price-primary .ux-textspans", "#prcIsum", "#mm-saleDscPrc"];
  // Photo principale de l'annonce -- passage 1 de la cascade d'identification
  // (§01 handoff, OCR Cloud Vision côté pricing_api) quand le titre seul ne
  // suffit pas. Vérifié en conditions réelles le 2026-08-22 sur 2 annonces
  // one-piece TCG distinctes (layout actuel eBay -- `#icImg`, l'ancien
  // sélecteur "classique", n'existe plus). `.active` d'abord (image
  // actuellement affichée dans le carrousel, au cas où l'utilisateur a déjà
  // changé de photo) puis la première du carrousel en repli.
  const IMAGE_SELECTORS = [".ux-image-carousel-item.active img", ".ux-image-carousel-item img"];

  const VERDICT_LABELS = { green: "Bonne affaire", yellow: "Prix normal", red: "Survendu" };
  const CURRENCY_SYMBOLS = { USD: "$", EUR: "€", GBP: "£" };
  const LANGUAGE_NAMES = { EN: "Anglaise", JP: "Japonaise", FR: "Française" };
  // Mini-drapeaux dessinés en SVG (grille 21x14 "pixel art", cf. classes
  // .cardquant-flag/.cq-* de panel.css pour les couleurs) -- repère de
  // langue partout où une carte a une langue affichée (picker de
  // désambiguïsation, fiche carte identifiée, comparaison par langue).
  // Remplace un premier essai en emoji drapeau (objet LANGUAGE_FLAGS,
  // retiré) : son rendu dépend d'une police emoji système que Windows n'a
  // pas toujours pour les drapeaux (retombe sur le code pays en texte
  // minuscule, vérifié en conditions réelles le 2026-08-23), inutilisable
  // pour distinguer vite deux candidats -- ou, pour une carte déjà
  // identifiée seule, pour confirmer sa langue d'un coup d'œil. Un SVG
  // inline ne dépend d'aucune police : rendu identique partout. Chaque
  // rect a une classe (cq-w/cq-r/cq-b/cq-navy) plutôt qu'un fill= répété --
  // les couleurs vivent dans panel.css, cohérent avec le reste de
  // l'extension (jamais de couleur en dur dans le HTML injecté).
  const LANGUAGE_FLAG_SVG = {
    FR: '<svg class="cardquant-flag cardquant-flag--fr" viewBox="0 0 21 14" aria-hidden="true"><rect x="0" y="0" width="7" height="14" class="cq-b"/><rect x="7" y="0" width="7" height="14" class="cq-w"/><rect x="14" y="0" width="7" height="14" class="cq-r"/></svg>',
    JP: '<svg class="cardquant-flag cardquant-flag--jp" viewBox="0 0 21 14" aria-hidden="true"><rect x="0" y="0" width="21" height="14" class="cq-w"/><rect x="8" y="3" width="4" height="1" class="cq-r"/><rect x="7" y="4" width="6" height="1" class="cq-r"/><rect x="6" y="5" width="8" height="1" class="cq-r"/><rect x="6" y="6" width="8" height="1" class="cq-r"/><rect x="6" y="7" width="8" height="1" class="cq-r"/><rect x="6" y="8" width="8" height="1" class="cq-r"/><rect x="7" y="9" width="6" height="1" class="cq-r"/><rect x="8" y="10" width="4" height="1" class="cq-r"/></svg>',
    EN: '<svg class="cardquant-flag cardquant-flag--en" viewBox="0 0 21 14" aria-hidden="true"><rect x="0" y="0" width="21" height="14" class="cq-navy"/><rect x="0" y="0" width="3" height="1" class="cq-w"/><rect x="18" y="0" width="3" height="1" class="cq-w"/><rect x="0" y="1" width="4" height="1" class="cq-w"/><rect x="17" y="1" width="4" height="1" class="cq-w"/><rect x="0" y="12" width="4" height="1" class="cq-w"/><rect x="17" y="12" width="4" height="1" class="cq-w"/><rect x="0" y="13" width="3" height="1" class="cq-w"/><rect x="18" y="13" width="3" height="1" class="cq-w"/><rect x="1" y="2" width="5" height="1" class="cq-w"/><rect x="15" y="2" width="5" height="1" class="cq-w"/><rect x="1" y="11" width="5" height="1" class="cq-w"/><rect x="15" y="11" width="5" height="1" class="cq-w"/><rect x="3" y="3" width="4" height="1" class="cq-w"/><rect x="14" y="3" width="4" height="1" class="cq-w"/><rect x="3" y="10" width="4" height="1" class="cq-w"/><rect x="14" y="10" width="4" height="1" class="cq-w"/><rect x="4" y="4" width="5" height="1" class="cq-w"/><rect x="12" y="4" width="5" height="1" class="cq-w"/><rect x="4" y="9" width="5" height="1" class="cq-w"/><rect x="12" y="9" width="5" height="1" class="cq-w"/><rect x="6" y="5" width="4" height="1" class="cq-w"/><rect x="11" y="5" width="4" height="1" class="cq-w"/><rect x="6" y="8" width="9" height="1" class="cq-w"/><rect x="7" y="6" width="7" height="1" class="cq-w"/><rect x="7" y="7" width="7" height="1" class="cq-w"/><rect x="0" y="0" width="1" height="1" class="cq-r"/><rect x="20" y="0" width="1" height="1" class="cq-r"/><rect x="0" y="13" width="1" height="1" class="cq-r"/><rect x="20" y="13" width="1" height="1" class="cq-r"/><rect x="1" y="1" width="2" height="1" class="cq-r"/><rect x="18" y="1" width="2" height="1" class="cq-r"/><rect x="1" y="12" width="2" height="1" class="cq-r"/><rect x="18" y="12" width="2" height="1" class="cq-r"/><rect x="3" y="2" width="1" height="1" class="cq-r"/><rect x="17" y="2" width="1" height="1" class="cq-r"/><rect x="3" y="11" width="1" height="1" class="cq-r"/><rect x="17" y="11" width="1" height="1" class="cq-r"/><rect x="4" y="3" width="2" height="1" class="cq-r"/><rect x="15" y="3" width="2" height="1" class="cq-r"/><rect x="4" y="10" width="2" height="1" class="cq-r"/><rect x="15" y="10" width="2" height="1" class="cq-r"/><rect x="6" y="4" width="1" height="1" class="cq-r"/><rect x="14" y="4" width="1" height="1" class="cq-r"/><rect x="6" y="9" width="1" height="1" class="cq-r"/><rect x="14" y="9" width="1" height="1" class="cq-r"/><rect x="7" y="5" width="2" height="1" class="cq-r"/><rect x="12" y="5" width="2" height="1" class="cq-r"/><rect x="7" y="8" width="2" height="1" class="cq-r"/><rect x="12" y="8" width="2" height="1" class="cq-r"/><rect x="9" y="6" width="1" height="1" class="cq-r"/><rect x="11" y="6" width="1" height="1" class="cq-r"/><rect x="9" y="7" width="3" height="1" class="cq-r"/><rect x="8" y="0" width="5" height="14" class="cq-w"/><rect x="0" y="5" width="21" height="5" class="cq-w"/><rect x="9" y="0" width="3" height="14" class="cq-r"/><rect x="0" y="6" width="21" height="3" class="cq-r"/></svg>',
  };

  // Petits pictos inline (traits, pas de dépendance externe -- cf. en-tête
  // de fichier) approximant le jeu d'icônes lucide-react déjà utilisé côté
  // Terminal (web/components/cardquant/core/Icon.tsx), pour un vocabulaire
  // visuel cohérent sans dupliquer toute la lib ici. Un seul <svg> générique
  // (icon()) plutôt qu'un balisage répété à chaque appel.
  const ICONS = {
    layers: '<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    compare: '<path d="M6 3v11a4 4 0 0 0 4 4h9"/><path d="m16 21 3-3-3-3"/><path d="M18 21V10a4 4 0 0 0-4-4H5"/><path d="M8 3 5 6l3 3"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
    trending: '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    wallet: '<path d="M20 7H5a2 2 0 0 1 0-4h12v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15v-6"/><path d="M17 11h4v4h-4a2 2 0 0 1 0-4Z"/>',
    external: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  };
  function icon(name, size) {
    const body = ICONS[name];
    if (!body) return "";
    return `<svg class="cardquant-icon" width="${size || 14}" height="${size || 14}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  // Miroir client de pricing/models.py::KNOWN_GRADES -- dupliqué faute de
  // vocabulaire partagé entre Python et cette extension (même situation que
  // web/lib/constants.ts, cf. commentaire de KNOWN_GRADES côté serveur), à
  // maintenir en sync à la main si le serveur change.
  const GRADE_OPTIONS = ["ungraded", "psa7", "psa8", "psa9", "psa9.5", "psa10"];
  const GRADE_LABELS = {
    ungraded: "Non gradée", psa7: "PSA 7", psa8: "PSA 8", psa9: "PSA 9", "psa9.5": "PSA 9.5", psa10: "PSA 10",
  };
  // Ordre important : 9.5 avant 9 (sinon /PSA\s?9/ matche "PSA 9.5" en
  // premier). BGS/CGC volontairement absents : pricing_api ne sait comparer
  // qu'à grade PSA/ungraded pour l'instant (cf. KNOWN_GRADES côté serveur) --
  // les détecter ici n'aurait nulle part où servir un prix, mieux vaut ne
  // rien deviner qu'afficher un grade que le backend ne sait pas pricer.
  const GRADE_PATTERNS = [
    [/PSA\s?10/i, "psa10"],
    [/PSA\s?9\.5/i, "psa9.5"],
    [/PSA\s?9\b/i, "psa9"],
    [/PSA\s?8\b/i, "psa8"],
    [/PSA\s?7\b/i, "psa7"],
  ];

  function detectGrade(text) {
    if (!text) return "ungraded";
    for (const [re, grade] of GRADE_PATTERNS) {
      if (re.test(text)) return grade;
    }
    return "ungraded";
  }

  function queryFirstText(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return null;
  }

  // Photo principale de l'annonce, en résolution max si le CDN eBay
  // l'expose -- confirmé en conditions réelles le 2026-08-22 (200 OK sur
  // /s-l1600.webp là où la page ne charge que /s-l500.webp par défaut) :
  // une image plus grande améliore la précision de l'OCR (pricing/ocr.py),
  // gratuit à demander (même objet i.ebayimg.com, juste un autre gabarit).
  // Repli sur l'URL telle quelle si le nom de fichier ne suit pas ce
  // pattern (image hors CDN eBay standard, cas rare mais possible).
  function findListingImageUrl() {
    for (const sel of IMAGE_SELECTORS) {
      const el = document.querySelector(sel);
      const src = el?.src;
      if (src) return src.replace(/\/s-l\d+\.(webp|jpg)$/, "/s-l1600.$1");
    }
    return null;
  }

  function parsePrice(raw) {
    if (!raw) return null;
    // Formats vus en pratique : "US $12.99" (point décimal, virgule =
    // milliers) sur ebay.com, "127,00 EUR" ou "1.234,56 EUR" (virgule
    // décimale, point = milliers) sur ebay.fr/.de/... -- une seule règle
    // "retire la virgule" (l'ancienne implémentation) transforme "127,00"
    // en 12700, une erreur x100 silencieuse sur tout site européen.
    //
    // ebay.fr (et d'autres sites EU) séparent aussi les milliers par une
    // espace insécable (U+00A0, parfois narrow U+202F) plutôt qu'un point :
    // "3 280,04 EUR". Cette espace n'est pas dans la classe [\d.,] ci-
    // dessous, donc sans ce nettoyage le raw.match la coupe en DEUX
    // matches ("3" et "280,04") et matches[length-1] ne garde que le
    // dernier -- un chiffre de milliers disparaît silencieusement (bug
    // constaté en test réel : "3 280,04 EUR" lu comme 280,04 EUR, cf.
    // retour utilisateur 2026-08-23). On retire toute espace strictement
    // entre deux chiffres avant l'extraction (U+00A0/U+202F explicites,
    // jamais un littéral invisible dans la source), jamais une espace
    // suivie d'autre chose (ex. avant "EUR").
    const cleaned = raw.replace(/(\d)[\s\u00A0\u202F\u2009](?=\d)/g, "$1");
    const matches = cleaned.match(/[\d.,]+/g);
    if (!matches) return null;
    let numStr = matches[matches.length - 1];
    const lastComma = numStr.lastIndexOf(",");
    const lastDot = numStr.lastIndexOf(".");
    if (lastComma > -1 && lastDot > -1) {
      // Les deux séparateurs présents -- celui qui apparaît en dernier est
      // le décimal ("1.234,56" EU vs "1,234.56" US).
      numStr = lastComma > lastDot
        ? numStr.replace(/\./g, "").replace(",", ".")
        : numStr.replace(/,/g, "");
    } else if (lastComma > -1) {
      // Une seule virgule : décimale si exactement 2 chiffres suivent
      // (format EU "127,00"), sinon séparateur de milliers ("1,234").
      const decimals = numStr.length - lastComma - 1;
      numStr = decimals === 2 ? numStr.replace(",", ".") : numStr.replace(/,/g, "");
    }
    const value = parseFloat(numStr);
    return Number.isFinite(value) ? value : null;
  }

  function detectCurrency(raw) {
    if (!raw) return null;
    if (/\$|USD/i.test(raw)) return "USD";
    if (/€|EUR/i.test(raw)) return "EUR";
    if (/£|GBP/i.test(raw)) return "GBP";
    return null;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function formatMoney(amount, currency) {
    if (amount == null) return "—";
    const symbol = CURRENCY_SYMBOLS[currency] || currency || "$";
    return `${amount.toFixed(2)} ${symbol}`;
  }

  // Même convention de signe que renderDeltaRow (− plutôt que le "-" natif
  // de toFixed, jamais devant un montant déjà négatif) -- réutilisée par le
  // ROI gradation et le calculateur d'arbitrage, tous deux susceptibles
  // d'afficher un montant négatif (perte).
  function formatSignedMoney(amount) {
    const sign = amount > 0 ? "+" : amount < 0 ? "−" : "±";
    return `${sign}${formatMoney(Math.abs(amount), "USD")}`;
  }

  // Même convention pour un pourcentage déjà signé (delta de volume/prix,
  // ROI...) -- centralisé ici pour ne pas répéter la même ligne à chaque
  // nouveau signal (population, divergence...).
  function formatSignedPct(pct, digits) {
    const sign = pct > 0 ? "+" : pct < 0 ? "−" : "±";
    return `${sign}${Math.abs(pct).toFixed(digits ?? 0)}%`;
  }

  // Même convention de signe, sans le "%" -- delta de POPULATION (un
  // compte de slabs, cf. PopulationSignal.grade10_delta_30d), pas un
  // pourcentage.
  function formatSignedInt(n) {
    const sign = n > 0 ? "+" : n < 0 ? "−" : "±";
    return `${sign}${Math.abs(n)}`;
  }

  function sendMessage(message) {
    return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
  }

  // Initiales (2 lettres max) + prénom pour l'avatar du header (cf.
  // buildPanel/setUser) -- même info que le site (session.displayName,
  // relayée par background.js::storeExternalSession), jamais recalculée
  // côté serveur : un simple découpage de chaîne, purement présentationnel.
  // Repli sur l'email si l'utilisateur n'a jamais renseigné de nom
  // (Google Sign-In le fournit presque toujours, mais jamais garanti).
  function userInitials(session) {
    const name = (session.displayName || "").trim();
    if (name) {
      const parts = name.split(/\s+/).filter(Boolean);
      return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
    }
    return (session.email || "?").slice(0, 2).toUpperCase();
  }
  function userFirstName(session) {
    const name = (session.displayName || "").trim();
    if (name) return name.split(/\s+/)[0];
    return (session.email || "").split("@")[0] || "Compte";
  }

  // Statut d'identification affiché dans le header persistant -- distinct
  // du verdict de prix (pill verte/ambre/rouge dans le corps) : répond à
  // "l'extension a-t-elle trouvé la carte ?", pas "est-ce une bonne affaire ?".
  const SKELETON = `
    <div class="cardquant-skeleton">
      <div class="cardquant-skeleton-bar cardquant-skeleton-bar--wide"></div>
      <div class="cardquant-skeleton-bar cardquant-skeleton-bar--pill"></div>
      <div class="cardquant-skeleton-bar cardquant-skeleton-bar--half"></div>
      <div class="cardquant-skeleton-bar cardquant-skeleton-bar--half"></div>
    </div>
  `;

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
    card.innerHTML = `
      <div class="cardquant-header">
        <span class="cardquant-brand">CARDQUANT</span>
        <span id="cardquant-status" class="cardquant-status cardquant-status--pending">…</span>
        <span id="cardquant-user" class="cardquant-user" hidden></span>
      </div>
      <div id="cardquant-body">${SKELETON}</div>
    `;

    root.append(tab, card);

    let open = false;
    function setOpen(next) {
      open = next;
      root.classList.toggle("cardquant-open", open);
    }
    tab.addEventListener("click", () => setOpen(!open));

    const body = () => card.querySelector("#cardquant-body");
    const status = () => card.querySelector("#cardquant-status");
    const userSlot = () => card.querySelector("#cardquant-user");

    function setStatus(text, tone) {
      const el = status();
      el.textContent = text;
      el.className = "cardquant-status" + (tone ? ` cardquant-status--${tone}` : "");
    }

    return {
      root,
      toggle: () => setOpen(!open),
      setOpen,
      // Avatar + prénom dans le header -- cf. userInitials/userFirstName.
      // Masqué (hidden) tant qu'aucune session n'est connue, jamais un
      // "?" générique affiché avant la 1ère réponse de CARDQUANT_GET_SESSION.
      setUser(session) {
        const el = userSlot();
        if (!session) {
          el.hidden = true;
          el.innerHTML = "";
          return;
        }
        el.hidden = false;
        el.innerHTML = `
          <span class="cardquant-avatar">${escapeHtml(userInitials(session))}</span>
          <span class="cardquant-user-name">${escapeHtml(userFirstName(session))}</span>
        `;
      },
      onClick(selector, handler) {
        card.addEventListener("click", (e) => {
          const el = e.target.closest(selector);
          if (el) handler(el);
        });
      },
      onChange(selector, handler) {
        card.addEventListener("change", (e) => {
          const el = e.target.closest(selector);
          if (el) handler(el);
        });
      },
      // "input" plutôt que "change" pour les champs numériques du ROI
      // gradation / calculateur d'arbitrage : recalcul à chaque frappe, pas
      // seulement au blur -- ces deux calculateurs sont 100% client (aucun
      // appel réseau), pas de raison d'attendre.
      onInput(selector, handler) {
        card.addEventListener("input", (e) => {
          const el = e.target.closest(selector);
          if (el) handler(el);
        });
      },
      // Activation clavier (Entrée/Espace) des éléments role="button" qui
      // ne sont pas des <button>/<select> natifs -- ex. cardquant-candidate
      // (picker de désambiguïsation) : un <li> cliquable a besoin de ça
      // pour être utilisable au clavier, contrairement aux autres contrôles
      // du panneau qui sont déjà des éléments natifs focusables.
      onKeydown(selector, handler) {
        card.addEventListener("keydown", (e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          const el = e.target.closest(selector);
          if (!el) return;
          e.preventDefault();
          handler(el);
        });
      },
      // "error" (échec de chargement d'une <img>) ne remonte jamais par
      // bubbling -- écoute en phase de capture, seul moyen de la déléguer
      // comme les autres événements du panneau (cf. onClick/onChange).
      onImgError(selector, handler) {
        card.addEventListener("error", (e) => {
          const el = e.target.closest?.(selector);
          if (el) handler(el);
        }, true);
      },
      setError(message) {
        setStatus("Erreur", "negative");
        body().innerHTML = `<p class="cardquant-error">${escapeHtml(message)}</p>`;
      },
      setSignedOut(errorMessage) {
        tab.classList.remove("cardquant-green", "cardquant-yellow", "cardquant-red");
        setStatus("Connexion requise");
        this.setUser(null);
        body().innerHTML = `
          <p>Connexion requise avant de voir le verdict d'une annonce.</p>
          ${errorMessage ? `<p class="cardquant-error">${escapeHtml(errorMessage)}</p>` : ""}
          <button type="button" class="cardquant-signin">Se connecter sur CardQuant</button>
        `;
      },
      setVerdict(data, original, currentGrade) {
        setOpen(true);
        tab.classList.remove("cardquant-green", "cardquant-yellow", "cardquant-red");
        if (data.verdict) tab.classList.add(`cardquant-${data.verdict}`);
        setStatus(...statusFor(data));
        body().innerHTML = renderVerdict(data, original, currentGrade);
      },
      setLoading() {
        // Remis à chaque nouvelle requête (pas seulement au premier rendu du
        // panneau) -- sinon le statut/verdict de la page précédente reste
        // affiché pendant l'attente de la réponse suivante.
        tab.classList.remove("cardquant-green", "cardquant-yellow", "cardquant-red");
        setStatus("…", "pending");
        body().innerHTML = SKELETON;
      },
    };
  }

  // (status text, tone) pour le header, à partir de la même réponse
  // /verdict que renderVerdict -- cf. son commentaire pour le détail des
  // statuts possibles (status !== "matched", "no_reference_price" a bien
  // une carte, etc.).
  function statusFor(data) {
    if (data.status === "ambiguous") return ["À vérifier", "warn"];
    if (data.status === "ok" || (data.status === "no_reference_price" && data.card)) return ["Identifiée", "positive"];
    return ["Non identifiée", "negative"];
  }

  // Libellé "N-1 candidat(s) supplémentaire(s)" pour la liste tronquée
  // ci-dessous -- accord simple, pas besoin d'i18n ici (extension FR only
  // pour l'instant, cf. manifest.json).
  function pluralFr(n, word) {
    return `${n} ${word}${n > 1 ? "s" : ""}`;
  }

  // Picker de désambiguïsation : chaque candidat est cliquable (data-card-id)
  // -- un clic relance /verdict avec selectedCardId, cf. requestVerdict et
  // background.js::CARDQUANT_GET_VERDICT. La miniature (image_url, cf.
  // pricing_api/schemas.py::CardCandidateOut) est le signal qui manque au
  // texte seul pour trancher des variantes comme "Manga"/"Alternate Art" --
  // même philosophie que le reste du matcher (jamais deviner), déplacée
  // vers l'humain plutôt que vers un score de confiance.
  function renderCandidate(c) {
    const setInfo = c.set_name ? `${c.set_name}${c.set_release_year ? ` (${c.set_release_year})` : ""}` : null;
    const meta = [c.code, c.rarity, setInfo].filter(Boolean).join(" · ");
    // Masquée au chargement en échec plutôt que l'icône "cassée" du
    // navigateur (cf. onImgError plus bas, écoute déléguée -- pas d'attribut
    // onerror inline, cohérent avec le reste du fichier qui n'utilise jamais
    // de handler inline sur le HTML injecté) -- l'hôte
    // (product-images.tcgplayer.com/storage.googleapis.com) est hors du
    // contrôle de cette extension, une image qui échoue à charger ne doit
    // jamais bloquer le picker.
    const thumb = c.image_url
      ? `<img class="cardquant-candidate-thumb" src="${escapeHtml(c.image_url)}" alt="" loading="lazy">`
      : `<div class="cardquant-candidate-thumb cardquant-candidate-thumb--empty" aria-hidden="true"></div>`;
    // Repère de langue devant le nom -- demande utilisateur (2026-08-23) :
    // deux candidats identiques par ailleurs (même carte, même rareté) sont
    // fréquents entre EN et JP, sans ce repère on ne sait pas lequel est
    // lequel en scannant vite la liste.
    const langName = c.language ? LANGUAGE_NAMES[c.language] || c.language : "";
    const flagIcon = c.language && LANGUAGE_FLAG_SVG[c.language]
      ? `<span class="cardquant-candidate-flag" title="${escapeHtml(langName)}" aria-label="${escapeHtml(langName)}">${LANGUAGE_FLAG_SVG[c.language]}</span>`
      : "";
    return `
      <li class="cardquant-candidate" data-card-id="${c.card_id}" role="button" tabindex="0">
        ${thumb}
        ${flagIcon}
        <div class="cardquant-candidate-info">
          <div class="cardquant-candidate-name">${escapeHtml(c.name)}</div>
          ${meta ? `<div class="cardquant-candidate-meta">${escapeHtml(meta)}</div>` : ""}
        </div>
      </li>
    `;
  }

  // -- Séparation nom / qualificatif de variante (ex. "Roronoa Zoro
  // [Alternate Art Manga]" -> "Roronoa Zoro" + "Alternate Art Manga") --
  // purement présentationnel : découpe une chaîne déjà fournie par le
  // backend, n'invente rien (cf. pricing/matching.py -- le catalogue note
  // déjà ses variantes entre crochets). Un contenu purement numérique
  // ("Cavendish (105)") n'est PAS un qualificatif de variante mais un
  // numéro apitcg -- même exclusion que pricing/matching.py::_qualifier_tokens
  // côté serveur, sinon on afficherait "105" comme fausse variante.
  function splitQualifier(name) {
    const m = /^(.*?)\s*[[(]([^\])]+)[\])]\s*$/.exec(name);
    if (!m) return { base: name, qualifier: null };
    const qualifier = /^\d+$/.test(m[2].trim()) ? null : m[2];
    return { base: m[1], qualifier };
  }

  function renderGradeBadge(currentGrade) {
    const graded = currentGrade !== "ungraded";
    return `
      <span class="cardquant-badge cardquant-grade-wrap"${graded ? ' data-graded="true"' : ""}>
        <select class="cardquant-grade-select" aria-label="Grade de la carte">
          ${GRADE_OPTIONS.map((g) => `<option value="${g}" ${g === currentGrade ? "selected" : ""}>${GRADE_LABELS[g]}</option>`).join("")}
        </select>
        <span class="cardquant-grade-pencil" aria-hidden="true">✎</span>
      </span>
    `;
  }

  // Set + année -- demande utilisateur (2026-08-23) : voir si une carte
  // vient d'un set classique ou d'un tirage promo/événement, et de quelle
  // année. `set_name` (déjà un libellé humain, cf.
  // pricing/repository.py::set_label_from_code) et `set_release_year`
  // (None si vraiment introuvable -- jamais deviné, cf.
  // fetch_set_release_year) viennent directement de /verdict. Pas de badge
  // "Promo"/"Normal" séparé : la rareté seule ne suffit pas à trancher de
  // façon fiable -- le nom du set et la rareté réelle sont affichés bruts,
  // à l'utilisateur de juger, jamais une classification binaire devinée à
  // sa place.
  function formatSetBadge(card) {
    if (!card.set_name) return null;
    const year = card.set_release_year ? ` (${card.set_release_year})` : "";
    // "One Piece" en dur : l'extension ne couvre que ce jeu pour l'instant
    // (cf. manifest.json, pricing/matching.py) -- à remplacer par un vrai
    // champ si un 2e TCG est ajouté un jour.
    return `One Piece · ${card.set_name}${year}`;
  }

  // -- Section identité de carte -------------------------------------------
  // Regroupe photo + nom/badges + verdict ponctuel/écart vs marché en une
  // seule "carte" ink-900 (cf. panel.css), même composition que la maquette
  // "CardQuant Panel" -- remplace l'ancien renderMeta + .cardquant-pill
  // séparés. `data.card.image_url` (cf. pricing_api/schemas.py::
  // CardCandidateOut) -- absent (rare) pour ~aucune carte du référentiel,
  // cf. tcg-index-handoff.md §04 -- case vide plutôt qu'une image cassée.
  function renderIdentityCard(data, original, currentGrade) {
    const { base, qualifier } = splitQualifier(data.card.name);
    const setBadge = formatSetBadge(data.card);
    const lang = data.card.language;
    const photo = data.card.image_url
      ? `<img class="cardquant-identity-photo" src="${escapeHtml(data.card.image_url)}" alt="" loading="lazy">`
      : `<div class="cardquant-identity-photo cardquant-identity-photo--empty" aria-hidden="true">Carte</div>`;

    const hasVerdict = data.status === "ok" && data.verdict;
    let footer = "";
    if (hasVerdict) {
      const deltaAbs = data.displayed_price - data.reference_price;
      const deltaPct = (deltaAbs / data.reference_price) * 100;
      const sign = deltaAbs > 0 ? "+" : deltaAbs < 0 ? "−" : "±";
      const tone = data.verdict === "green" ? "positive" : data.verdict === "red" ? "negative" : "warn";
      footer = `
        <div class="cardquant-identity-divider"></div>
        <div class="cardquant-identity-footer">
          <div class="cardquant-identity-footer-col">
            <span class="cardquant-identity-footer-label">Verdict ponctuel</span>
            <span class="cardquant-identity-verdict cardquant-${tone}">${escapeHtml(VERDICT_LABELS[data.verdict] || data.verdict)}</span>
          </div>
          <div class="cardquant-identity-footer-col cardquant-identity-footer-col--right">
            <span class="cardquant-identity-footer-label">Écart vs marché</span>
            <span class="cardquant-identity-delta cardquant-${tone}">
              ${sign}${Math.abs(deltaAbs).toFixed(2)} $
              <span class="cardquant-identity-delta-pct">${sign}${Math.abs(deltaPct).toFixed(1)}%</span>
            </span>
          </div>
        </div>
      `;
    }

    return `
      <div class="cardquant-identity-card">
        <div class="cardquant-identity-top">
          <div class="cardquant-identity-info">
            <p class="cardquant-card-name">${escapeHtml(base)}${qualifier ? ` <span class="cardquant-muted-inline">(${escapeHtml(qualifier)})</span>` : ""}</p>
            ${data.card.code ? `<p class="cardquant-card-qualifier">${escapeHtml(data.card.code)}</p>` : ""}
            <div class="cardquant-badge-row">
              ${lang ? `<span class="cardquant-badge">${LANGUAGE_FLAG_SVG[lang] || ""}${escapeHtml(LANGUAGE_NAMES[lang] || lang)}</span>` : ""}
              ${data.card.rarity ? `<span class="cardquant-badge">${escapeHtml(data.card.rarity)}</span>` : ""}
              ${renderGradeBadge(currentGrade)}
            </div>
            ${setBadge ? `<p class="cardquant-set-badge">${escapeHtml(setBadge)}</p>` : ""}
          </div>
          ${photo}
        </div>
        ${footer}
      </div>
    `;
  }

  // -- Score d'opportunité --------------------------------------------------
  // Jauge continue 0-100 calculée côté serveur (cf.
  // pricing/opportunity_score.py) -- ce fichier ne fait que la dessiner en
  // barre segmentée (14 pas, même rampe de couleur rouge->ambre->vert que la
  // maquette "CardQuant Panel"). Volontairement PAS renommée "Score
  // structurel" comme dans la maquette : ce nom-là désigne déjà, côté
  // Terminal, un signal DIFFÉRENT (undervalued_scores/relative_value_scores,
  // rareté x popularité vs marché, recalculé chaque nuit -- cf.
  // web/components/cardquant/undervalued/StructuralScorePanel.tsx et
  // pricing/opportunity_score.py). Réutiliser le même nom pour deux mesures
  // différentes aurait été trompeur -- ce gauge reste "Score d'opportunité",
  // seul son habillage visuel et ses libellés de palier s'inspirent de la
  // maquette.
  function scoreRamp(t) {
    const stops = [[248, 14, 53], [255, 176, 62], [118, 251, 145]]; // rouge (down-500) -> ambre -> vert (green-400)
    const k = t <= 0.5 ? 0 : 1;
    const u = t <= 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
    const a = stops[k], b = stops[k + 1];
    const mix = a.map((c, i) => Math.round(c + (b[i] - c) * u));
    return `rgb(${mix.join(",")})`;
  }
  function scoreLabel(score) {
    if (score >= 75) return "Bonne affaire";
    if (score >= 55) return "Léger escompte";
    if (score >= 40) return "Prix correct";
    if (score >= 25) return "Cher";
    return "Survendu";
  }
  function renderGauge(score) {
    const n = 14;
    if (score == null) {
      return `
        <div class="cardquant-section">
          <div class="cardquant-section-header">
            <p class="cardquant-section-title">Score d'opportunité</p>
            <span class="cardquant-gauge-label cardquant-muted">Indisponible</span>
          </div>
          <div class="cardquant-gauge-steps">
            ${Array.from({ length: n }, () => `<span class="cardquant-gauge-step" style="background: var(--cq-ink-700)"></span>`).join("")}
          </div>
          <p class="cardquant-gauge-note">Pas encore de prix de référence pour cette carte -- score indisponible.</p>
        </div>
      `;
    }
    const clamped = Math.max(0, Math.min(100, score));
    const filled = Math.round((clamped / 100) * n);
    const color = scoreRamp(clamped / 100);
    const steps = Array.from({ length: n }, (_, i) => {
      const isHead = i === filled - 1;
      const on = i < filled;
      const stepColor = isHead ? color : on ? scoreRamp(i / (n - 1)) : "var(--cq-ink-700)";
      return `<span class="cardquant-gauge-step${isHead ? " cardquant-gauge-step--head" : ""}" style="background: ${stepColor}"></span>`;
    }).join("");
    return `
      <div class="cardquant-section">
        <div class="cardquant-section-header">
          <p class="cardquant-section-title">Score d'opportunité</p>
          <span class="cardquant-gauge-score" style="color: ${color}">${clamped} <span class="cardquant-muted-inline">/ 100</span></span>
        </div>
        <div class="cardquant-gauge-steps">${steps}</div>
        <div class="cardquant-gauge-scale">
          <span>Mauvaise</span><span style="color: ${color}; font-weight: 700;">${scoreLabel(clamped)}</span><span>Excellente</span>
        </div>
      </div>
    `;
  }

  // -- Analyse de prix -------------------------------------------------------
  // Prix annonce (DOM) + prix de marché + médiane récente/moy. 10 ventes
  // (tous pricing_api, cf. pricing/sales_stats.py côté serveur) -- lignes
  // absentes si aucune vente connue (jamais 0 $ affiché comme une vraie
  // moyenne). L'écart vs marché ne vit plus ici (déplacé dans le pied de
  // l'identité de carte, cf. renderIdentityCard) -- il n'apparaissait
  // qu'une fois dans la maquette, pas de raison de le dupliquer.
  function renderPriceAnalysis(data, original) {
    const stats = data.sales_stats;
    const rows = [];
    if (data.reference_price != null) {
      rows.push({ label: "Prix de marché", sub: "PriceCharting", value: formatMoney(data.reference_price, "USD") });
    }
    if (stats && stats.median_recent != null) {
      // Taille de fenêtre toujours affichée -- la fenêtre est adaptative
      // (3 à 5 ventes selon leur densité temporelle, cf.
      // pricing/sales_stats.py) donc "3" n'est plus un défaut implicite.
      rows.push({ label: `Médiane ventes récentes (${stats.sample_size_recent})`, value: formatMoney(stats.median_recent, stats.currency) });
    }
    if (stats && stats.avg_last_10 != null) {
      const note = stats.sample_size_10 < 10 ? ` (${stats.sample_size_10})` : "";
      rows.push({ label: `Moy. 10 dernières ventes${note}`, value: formatMoney(stats.avg_last_10, stats.currency) });
    }
    const originalNote = original
      ? ` <span class="cardquant-muted-inline">(${original.amount.toFixed(2)} ${CURRENCY_SYMBOLS[original.currency] || original.currency})</span>`
      : "";
    return `
      <div class="cardquant-section cardquant-price-analysis">
        <p class="cardquant-section-title">Analyse de prix</p>
        <div class="cardquant-price-row cardquant-price-row--lead">
          <span>Prix d'annonce</span>
          <span class="cardquant-price-value">${formatMoney(data.displayed_price, "USD")}${originalNote}</span>
        </div>
        ${rows.map((r) => `
          <div class="cardquant-price-row">
            <span>${escapeHtml(r.label)}${r.sub ? ` <span class="cardquant-muted-inline">(${escapeHtml(r.sub)})</span>` : ""}</span>
            <span class="cardquant-price-value">${r.value}</span>
          </div>
        `).join("")}
        <div class="cardquant-price-source">
          <span class="cardquant-badge cardquant-badge--dot">PriceCharting</span>
        </div>
      </div>
    `;
  }

  // -- Rangées d'analyse repliables -------------------------------------
  // "Population par note", "Liquidité", "Arbitrage inter-langue",
  // "ROI gradation", "Divergence prix/volume", "Positionnement dans le
  // set" et "Calculateur d'arbitrage" partagent maintenant une seule carte
  // (.cardquant-analysis-card, cf. panel.css) où chaque signal est une
  // rangée <details>/<summary> avec une valeur d'aperçu à droite -- même
  // esprit que l'ancien renderCollapsible (clavier/focus natifs gratuits),
  // juste regroupées visuellement comme dans la maquette "CardQuant Panel"
  // plutôt qu'en sections indépendantes.
  function renderRow({ iconName, title, preview, previewTone, bodyHtml, id, open }) {
    return `
      <details class="cardquant-row"${id ? ` id="${id}"` : ""}${open ? " open" : ""}>
        <summary class="cardquant-row-summary">
          <span class="cardquant-row-icon">${icon(iconName)}</span>
          <span class="cardquant-row-title">${title}</span>
          ${preview != null ? `<span class="cardquant-row-preview${previewTone ? ` cardquant-${previewTone}` : ""}">${preview}</span>` : ""}
          <span class="cardquant-row-chevron" aria-hidden="true"></span>
        </summary>
        <div class="cardquant-row-body">${bodyHtml}</div>
      </details>
    `;
  }

  // -- Population par note (cf. shared/verdict.py::PopulationSignal) -------
  // Mêmes 5 paliers que le Terminal (PSA10/9/8/7/≤6, cf.
  // web/components/cardquant/population/GradeDistributionPanel.tsx), mêmes
  // couleurs -- vocabulaire identique Terminal/extension plutôt que
  // recopier le regroupement "≤ PSA 7" à 4 paliers de la maquette
  // d'origine. Ouverte par défaut (cf. renderRow open:true) : c'est le 1er
  // signal de la liste, presque toujours pertinent pour un single.
  function renderPopulationRow(population) {
    if (!population) return "";
    const bars = [
      { label: "PSA 10", value: population.grade10, color: "var(--cq-green)" },
      { label: "PSA 9", value: population.grade9, color: "var(--cq-up)" },
      { label: "PSA 8", value: population.grade8, color: "var(--cq-text-strong)" },
      { label: "PSA 7", value: population.grade7, color: "var(--cq-grey-400)" },
      { label: "≤ PSA 6", value: population.grade6, color: "var(--cq-grey-300)" },
    ];
    const max = Math.max(1, ...bars.map((b) => b.value));
    const bodyHtml = `
      <div class="cardquant-pop-bars">
        ${bars.map((b) => `
          <div class="cardquant-pop-bar-row">
            <span class="cardquant-pop-bar-label">${b.label}</span>
            <span class="cardquant-pop-bar-track"><span class="cardquant-pop-bar-fill" style="width:${(b.value / max) * 100}%; background:${b.color}"></span></span>
            <span class="cardquant-pop-bar-value">${b.value}</span>
          </div>
        `).join("")}
      </div>
      <div class="cardquant-pop-stats">
        <span class="cardquant-pop-stat">
          <span class="cardquant-pop-stat-value">${population.gem_rate_pct != null ? `${population.gem_rate_pct.toFixed(1)}%` : "—"}</span>
          <span class="cardquant-pop-stat-label">Gem rate</span>
        </span>
        <span class="cardquant-pop-stat">
          <span class="cardquant-pop-stat-value cardquant-${population.grade10_delta_30d > 0 ? "positive" : "muted"}">${population.grade10_delta_30d != null ? formatSignedInt(population.grade10_delta_30d) : "—"}</span>
          <span class="cardquant-pop-stat-label">POP 10 · 30j</span>
        </span>
        <span class="cardquant-pop-stat">
          <span class="cardquant-pop-stat-value">${population.premium_10_9 != null ? `×${population.premium_10_9.toFixed(1)}` : "—"}</span>
          <span class="cardquant-pop-stat-label">Prime PSA 10/9</span>
        </span>
      </div>
    `;
    return renderRow({
      iconName: "layers", title: "Population par note",
      preview: `PSA · POP ${population.total}`, bodyHtml, id: "cardquant-population", open: true,
    });
  }

  const LIQUIDITY_STATUS = {
    liquide: { text: "Marché liquide", tone: "positive" },
    modere: { text: "Marché modéré", tone: "warn" },
    illiquide: { text: "Marché illiquide", tone: "negative" },
  };

  // active_listings peut être `null` -- PAS 0 -- cf.
  // pricing/repository.py::fetch_latest_active_listing_count. Afficher "—"
  // plutôt qu'un faux 0 est la seule option honnête ici.
  function renderLiquidityRow(liquidity, grade) {
    if (!liquidity) return "";
    const status = LIQUIDITY_STATUS[liquidity.label] || { text: liquidity.label, tone: "muted" };
    const isGraded = grade !== "ungraded";
    const note = liquidity.active_listings == null
      ? "<p class=\"cardquant-todo\">Annonces actives : indisponibles pour cette carte pour le moment.</p>"
      : "";
    const bodyHtml = `
        <div class="cardquant-stat-grid">
          <div class="cardquant-stat">
            <span class="cardquant-stat-value">${liquidity.sales_last_90d}</span>
            <span class="cardquant-stat-label">ventes conclues</span>
          </div>
          <div class="cardquant-stat">
            <span class="cardquant-stat-value">${liquidity.active_listings != null ? liquidity.active_listings : "—"}</span>
            <span class="cardquant-stat-label">en vente active${isGraded && liquidity.active_listings != null ? " (toutes notes)" : ""}</span>
          </div>
        </div>
        <p class="cardquant-liquidity-status cardquant-${status.tone}">${escapeHtml(status.text)} · ~${liquidity.sales_per_month.toFixed(1)} ventes/mois</p>
        ${note}
    `;
    return renderRow({
      iconName: "activity", title: "Liquidité · 3 derniers mois",
      preview: `${liquidity.sales_last_90d} ventes`, bodyHtml,
    });
  }

  function renderLanguageRow(entry, current) {
    const flag = LANGUAGE_FLAG_SVG[entry.language] || "";
    const name = LANGUAGE_NAMES[entry.language] || entry.language;
    let pctBadge = "";
    if (!entry.is_current_listing && entry.price != null && current && current.price) {
      const pct = ((entry.price - current.price) / current.price) * 100;
      if (Math.abs(pct) >= 1) {
        pctBadge = `<span class="cardquant-lang-pct cardquant-${pct > 0 ? "positive" : "muted"}">${pct > 0 ? "+" : ""}${pct.toFixed(0)}%</span>`;
      }
    }
    return `
      <div class="cardquant-lang-row${entry.is_current_listing ? " cardquant-lang-row--current" : ""}">
        <span class="cardquant-lang-name">${flag}${escapeHtml(name)}</span>
        ${entry.is_current_listing ? '<span class="cardquant-badge cardquant-badge--sm">cette annonce</span>' : ""}
        <span class="cardquant-lang-price">${entry.price == null ? "pas d'équivalent" : formatMoney(entry.price, entry.currency)}${pctBadge}</span>
      </div>
    `;
  }

  // Écart le plus marqué parmi les langues sœurs -- réutilisé à la fois
  // pour l'aperçu de la rangée (repliée) et pour la phrase dans le corps
  // (dépliée). Seulement si l'écart est assez grand pour être un signal
  // utile, pas du bruit d'arrondi.
  function bestLanguageGap(entries, current) {
    if (!current || current.price == null) return null;
    let best = null;
    for (const e of entries) {
      if (e.is_current_listing || e.price == null) continue;
      const pct = ((e.price - current.price) / current.price) * 100;
      if (!best || Math.abs(pct) > Math.abs(best.pct)) best = { entry: e, pct };
    }
    if (!best || Math.abs(best.pct) < 15) return null;
    return best;
  }

  function renderLanguageComparisonRow(entries) {
    if (!entries || entries.length < 2) return ""; // aucune langue sœur connue -- rien à comparer
    const current = entries.find((e) => e.is_current_listing);
    const best = bestLanguageGap(entries, current);
    let preview = null;
    let previewTone = null;
    if (best) {
      const name = (LANGUAGE_NAMES[best.entry.language] || best.entry.language).toUpperCase();
      preview = `${escapeHtml(name)} ${best.pct > 0 ? "+" : ""}${best.pct.toFixed(0)}%`;
      previewTone = best.pct < 0 ? "negative" : "positive";
    }
    const note = best
      ? `<p class="cardquant-arbitrage-note">L'équivalent ${escapeHtml((LANGUAGE_NAMES[best.entry.language] || best.entry.language).toLowerCase())} se vend ${Math.abs(best.pct).toFixed(0)}% ${best.pct > 0 ? "plus cher" : "moins cher"} — arbitrage possible.</p>`
      : "";
    const bodyHtml = `<div class="cardquant-lang-list">${entries.map((e) => renderLanguageRow(e, current)).join("")}</div>${note}`;
    return renderRow({ iconName: "compare", title: "Arbitrage inter-langue", preview, previewTone, bodyHtml });
  }

  function renderSealedDisplay(price) {
    if (!price) return "";
    return `
      <div class="cardquant-section">
        <p class="cardquant-section-title">Display scellé · même set</p>
        <p class="cardquant-sealed-price">${formatMoney(price.price, price.currency)}</p>
      </div>
    `;
  }

  // -- ROI gradation ----------------------------------------------------
  // Formules dans lib/gradingRoi.js (port de web/lib/gradingRoi.ts) --
  // aucun calcul ici, seulement du rendu + lecture des hypothèses saisies.
  // Recalculé en live (cf. panel.onInput/onChange plus bas) SANS repasser
  // par /verdict : `grading_roi_inputs` (déjà dans la réponse du dernier
  // verdict, cf. lastVerdictData) suffit à tout recalculer côté client.

  const GROI_SOURCE_LABELS = { card: "cette carte", setRarity: "set + rareté", set: "ce set", tcg: "tout le TCG" };
  const GROI_GRADE_LABELS = { psa7: "PSA 7", psa8: "PSA 8", psa9: "PSA 9", "psa9.5": "PSA 9.5", psa10: "PSA 10" };

  function groiCandidateFromInputs(inputs) {
    const R = window.CardQuantGradingRoi;
    const distribution = R.resolveGradeDistribution({
      card: inputs.grade_counts.card,
      setRarity: inputs.grade_counts.set_rarity,
      set: inputs.grade_counts.set,
      tcg: inputs.grade_counts.tcg,
    });
    return {
      candidate: { ungradedPrice: inputs.ungraded_price, gradePrices: inputs.grade_prices, gradeMix: distribution.gradeMix },
      distribution,
    };
  }

  // Aperçu (aux hypothèses par défaut) affiché dans la rangée repliée --
  // null si aucun prix gradé connu (cf. renderGroiOutput, même garde).
  function groiPreviewPct(inputs) {
    if (!inputs) return null;
    const R = window.CardQuantGradingRoi;
    const { candidate } = groiCandidateFromInputs(inputs);
    if (Object.keys(candidate.gradePrices).length === 0) return null;
    return R.computeGradingRoi(candidate, R.DEFAULT_ASSUMPTIONS).roiPct;
  }

  function renderGroiBreakdownRow(entry) {
    const label = entry.key === "lowGrade" ? "< PSA 7" : GROI_GRADE_LABELS[entry.key];
    return `
      <div class="cardquant-groi-row">
        <span class="cardquant-groi-row-label">${label}</span>
        <span class="cardquant-groi-row-prob">${(entry.probability * 100).toFixed(0)}%</span>
        <span class="cardquant-groi-row-price">${formatMoney(entry.price, "USD")}</span>
      </div>
    `;
  }

  function renderGroiOutput(inputs, assumptions) {
    const R = window.CardQuantGradingRoi;
    const { candidate, distribution } = groiCandidateFromInputs(inputs);
    if (Object.keys(candidate.gradePrices).length === 0) {
      return '<p class="cardquant-todo">Aucun prix gradé connu pour cette carte pour l\'instant.</p>';
    }
    const result = R.computeGradingRoi(candidate, assumptions);
    const tone = result.roiPct > 0 ? "positive" : result.roiPct < -10 ? "negative" : "warn";
    return `
      <dl class="cardquant-analysis-list">
        <dt>Valeur attendue (nette)</dt><dd>${formatMoney(result.expectedValueNet, "USD")}</dd>
        <dt>Coût total (carte + gradation)</dt><dd>${formatMoney(result.totalCost, "USD")}</dd>
        <dt>Profit net estimé</dt><dd class="cardquant-${tone}">${formatSignedMoney(result.netProfit)}</dd>
      </dl>
      <p class="cardquant-groi-roi cardquant-${tone}">ROI ${result.roiPct >= 0 ? "+" : ""}${result.roiPct.toFixed(0)}%</p>
      <p class="cardquant-groi-source">Distribution basée sur ${distribution.sampleSize} vente${distribution.sampleSize > 1 ? "s" : ""} gradée${distribution.sampleSize > 1 ? "s" : ""} (${GROI_SOURCE_LABELS[distribution.sourceLevel]}).</p>
      <div class="cardquant-groi-breakdown">${result.breakdown.map(renderGroiBreakdownRow).join("")}</div>
    `;
  }

  function renderGradingRoiRow(inputs) {
    if (!inputs) {
      return renderRow({
        iconName: "target", title: "ROI gradation", preview: "indisponible", previewTone: "muted",
        bodyHtml: '<p class="cardquant-todo">Pas encore de données de gradation pour cette carte (calculées une fois par cycle de synchro).</p>',
      });
    }
    const R = window.CardQuantGradingRoi;
    const A = R.DEFAULT_ASSUMPTIONS;
    const { candidate } = groiCandidateFromInputs(inputs);
    const suggested = R.suggestServiceTier(candidate);
    const previewPct = groiPreviewPct(inputs);
    const bodyHtml = `
        <div class="cardquant-groi-assumptions">
          <label>Palier PSA
            <select class="cardquant-groi-tier">
              ${R.PSA_SERVICE_TIERS.map((t) => `<option value="${t.id}" ${t.id === suggested ? "selected" : ""}>${t.label} — ${t.feeUsd}$</option>`).join("")}
            </select>
          </label>
          <label>Frais divers ($)<input type="number" min="0" step="1" class="cardquant-groi-extra" value="${A.extraCostsUsd}"></label>
          <label>Risque sous-note (%)<input type="number" min="0" max="100" step="1" class="cardquant-groi-lowp" value="${A.lowGradeProbabilityPct}"></label>
          <label>Frais revente (%)<input type="number" min="0" max="100" step="1" class="cardquant-groi-fee" value="${A.resaleFeePct}"></label>
        </div>
        <div class="cardquant-groi-output">${renderGroiOutput(inputs, { ...A })}</div>
    `;
    return renderRow({
      iconName: "target", title: "ROI gradation",
      preview: previewPct != null ? `${previewPct >= 0 ? "+" : ""}${previewPct.toFixed(0)}%` : "indisponible",
      previewTone: previewPct == null ? "muted" : previewPct > 0 ? "positive" : "negative",
      bodyHtml, id: "cardquant-groi",
    });
  }

  // -- Divergence prix / volume (cf. shared/verdict.py::VolumeDivergenceSignal) --
  // Compare le nb de ventes et le prix médian des 30 derniers jours à la
  // fenêtre des 30 jours précédents -- signal ABSENT (pas de rangée) si les
  // deux fenêtres sont vides (rien à comparer), jamais un "0%" trompeur.
  function renderVolumeDivergenceRow(signal) {
    if (!signal) return "";
    let preview;
    let previewTone;
    if (signal.volume_delta_pct != null) {
      preview = `Volume ${formatSignedPct(signal.volume_delta_pct)}`;
      previewTone = signal.volume_delta_pct > 0 ? "positive" : signal.volume_delta_pct < 0 ? "negative" : "muted";
    } else {
      preview = `${signal.recent_sales} vente${signal.recent_sales > 1 ? "s" : ""}/30j`;
      previewTone = "muted";
    }
    const bodyHtml = `
      <dl class="cardquant-analysis-list">
        <dt>Ventes -- 30 derniers jours</dt><dd>${signal.recent_sales}</dd>
        <dt>Ventes -- 30 jours précédents</dt><dd>${signal.prior_sales}</dd>
        ${signal.recent_median_price != null ? `<dt>Prix médian -- 30 derniers jours</dt><dd>${formatMoney(signal.recent_median_price, "USD")}</dd>` : ""}
        ${signal.prior_median_price != null ? `<dt>Prix médian -- 30 jours précédents</dt><dd>${formatMoney(signal.prior_median_price, "USD")}</dd>` : ""}
        ${signal.price_delta_pct != null ? `<dt>Écart de prix</dt><dd class="cardquant-${signal.price_delta_pct >= 0 ? "positive" : "negative"}">${formatSignedPct(signal.price_delta_pct, 1)}</dd>` : ""}
      </dl>
      <p class="cardquant-todo">Volume = nb de ventes conclues connues sur chaque fenêtre de 30 jours (même grade que cette consultation) -- pas les annonces actives.</p>
    `;
    return renderRow({ iconName: "trending", title: "Divergence prix / volume", preview, previewTone, bodyHtml });
  }

  // -- Positionnement dans le set (cf. shared/verdict.py::SetPositionSignal) --
  function renderSetPositionRow(signal) {
    if (!signal) return "";
    const bodyHtml = `<p class="cardquant-todo">Rang par prix (PriceCharting, non gradé) décroissant parmi les singles du même set qui ont eux-mêmes un prix connu -- #1 = carte la plus chère du set.</p>`;
    return renderRow({
      iconName: "layers", title: "Positionnement dans le set",
      preview: `#${signal.rank} / ${signal.total}`, bodyHtml,
    });
  }

  // -- Calculateur d'arbitrage --------------------------------------------
  // 100% client (§07 handoff) : prix_revente_moyen réutilise reference_price
  // (déjà calculé pour le verdict ponctuel, rien en plus à collecter côté
  // serveur), achat/livraison/douane saisis par l'utilisateur.

  function renderArbitrageOutput(referencePrice, buy, ship, customs) {
    const profit = referencePrice - (buy + ship + customs);
    const tone = profit > 0 ? "positive" : profit < 0 ? "negative" : "warn";
    return `<p class="cardquant-arb-profit cardquant-${tone}">${formatSignedMoney(profit)} <span class="cardquant-muted-inline">de bénéfice estimé</span></p>`;
  }

  function renderArbitrageCalculatorRow(data) {
    const ref = data.reference_price;
    if (ref == null) {
      return renderRow({
        iconName: "repeat", title: "Calculateur d'arbitrage", previewTone: "muted",
        bodyHtml: '<p class="cardquant-todo">Pas de prix de référence pour cette carte -- calculateur indisponible.</p>',
      });
    }
    const bodyHtml = `
        <p class="cardquant-arb-ref">Prix de revente moyen : <strong>${formatMoney(ref, "USD")}</strong> <span class="cardquant-muted-inline">(même référence que le verdict)</span></p>
        <div class="cardquant-arb-inputs">
          <label>Achat ($)<input type="number" min="0" step="0.01" class="cardquant-arb-buy" value="0"></label>
          <label>Livraison ($)<input type="number" min="0" step="0.01" class="cardquant-arb-ship" value="0"></label>
          <label>Douane ($)<input type="number" min="0" step="0.01" class="cardquant-arb-customs" value="0"></label>
        </div>
        <div class="cardquant-arb-output">${renderArbitrageOutput(ref, 0, 0, 0)}</div>
    `;
    return renderRow({ iconName: "repeat", title: "Calculateur d'arbitrage", bodyHtml, id: "cardquant-arb" });
  }

  function renderAnalysisCard(data) {
    const rows = [
      renderPopulationRow(data.population),
      renderLiquidityRow(data.liquidity, data.grade),
      renderLanguageComparisonRow(data.language_comparison),
      renderGradingRoiRow(data.grading_roi_inputs),
      renderVolumeDivergenceRow(data.volume_divergence),
      renderSetPositionRow(data.set_position),
      renderArbitrageCalculatorRow(data),
    ].filter(Boolean).join("");
    return `<div class="cardquant-analysis-card">${rows}</div>`;
  }

  // Liens de double-vérification vers PriceCharting -- demande utilisateur
  // (2026-08-22, étendu 2026-08-23). PriceCharting est en plus la source
  // même du prix de référence (cf. shared/verdict.py::
  // compute_verdict_for_card), donc pertinent à vérifier. Chaque lien
  // pointe vers la VRAIE page produit exacte -- déjà résolue par le
  // scrape/matching serveur, exposée ici via sources_compared[].url /
  // language_comparison[].url plutôt que reconstruite/devinée côté
  // extension. Absent (pas de bouton) si PriceCharting n'a pas matché cette
  // langue -- jamais un lien de recherche de repli qui laisserait croire à
  // un lien exact. Le 1er lien (langue de cette annonce) est mis en avant
  // (rempli, vert) -- les langues sœurs restent en contour, même hiérarchie
  // que la maquette "CardQuant Panel" (Anglaise pleine/Japonaise contour).
  function renderVerificationLink(url, language, label, primary) {
    if (!url) return "";
    const flag = LANGUAGE_FLAG_SVG[language] || "";
    return `
      <a class="cardquant-verify-link${primary ? " cardquant-verify-link--primary" : ""}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
        ${flag}<span>${escapeHtml(label)}</span>${icon("external", 13)}
      </a>
    `;
  }

  function renderVerificationLinks(data) {
    const currentSource = (data.sources_compared || []).find((s) => s.source === "pricecharting" && s.url);
    const currentLink = currentSource?.url
      ? renderVerificationLink(currentSource.url, data.card.language, LANGUAGE_NAMES[data.card.language] || "Cette langue", true)
      : "";
    const siblingLinks = (data.language_comparison || [])
      .filter((e) => !e.is_current_listing && e.url)
      .map((e) => renderVerificationLink(e.url, e.language, LANGUAGE_NAMES[e.language] || e.language, false))
      .join("");
    if (!currentLink && !siblingLinks) return "";
    return `
      <div class="cardquant-section">
        <p class="cardquant-section-title">Vérifier sur PriceCharting</p>
        <div class="cardquant-verify-grid">${currentLink}${siblingLinks}</div>
      </div>
    `;
  }

  // -- Watchlist (§10 handoff, backend ajouté le 2026-08-29, cf.
  // pricing_api/main.py::/favorites) et portefeuille (écran PnL, backend
  // ajouté 2026-08-31, cf. pricing_api/main.py::/portfolio) -----------------
  // "Suivre" ajoute/retire la carte identifiée des favoris. "Noter l'achat"
  // journalise directement une position au prix affiché de l'annonce, grade
  // courant, quantité 1, date du jour -- pas de mini-formulaire ici (ces
  // valeurs sont déjà toutes connues du panneau) : modifiable ensuite sur
  // l'écran PnL du site (montant, quantité, date...), cf. renderFooter.
  // État initial "…" désactivé pour "Suivre" -- jamais deviné (favori ou
  // pas ?), toujours confirmé par un aller-retour réseau à part (cf.
  // refreshFavoriteStatus plus bas), même discipline que le reste du
  // panneau ("ne jamais deviner", §01 handoff).
  function renderActionsRow(itemId) {
    return `
      <div class="cardquant-actions-row">
        <button type="button" class="cardquant-action-btn cardquant-favorite-btn" data-item-id="${itemId}" data-favorited="unknown" disabled>${icon("eye")}<span>…</span></button>
        <button type="button" class="cardquant-action-btn cardquant-portfolio-btn">${icon("wallet")}<span>Noter l'achat</span></button>
      </div>
      <p class="cardquant-favorite-note" hidden></p>
      <p class="cardquant-portfolio-note" hidden></p>
    `;
  }

  // Vue commune "carte identifiée" (statuts 'ok' et 'no_reference_price') --
  // tous les blocs sont défensifs (rien affiché si la donnée n'est pas là),
  // cf. pricing_api/schemas.py pour ce qui est None dans quel cas.
  function renderCardDetail(data, original, currentGrade) {
    return `
      ${renderOpenCardCta(data.card.card_id)}
      ${renderIdentityCard(data, original, currentGrade)}
      ${renderGauge(data.opportunity_score)}
      ${renderPriceAnalysis(data, original)}
      ${renderAnalysisCard(data)}
      ${renderActionsRow(data.card.card_id)}
      ${renderSealedDisplay(data.sealed_display_price)}
      ${renderVerificationLinks(data)}
      ${renderFooter()}
    `;
  }

  // "Ouvrir la fiche sur CardQuant" -- la fiche carte existe désormais
  // réellement sur le site (cf. mémoire projet "cardquant-rebrand", écran
  // Fiche carte / app/(cardquant)/catalog/[id]), retirée le 2026-08-23
  // faute d'URL fixe à l'époque, réintroduite maintenant que /catalog/{id}
  // est une vraie route -- cf. background.js::CARDQUANT_OPEN_CARD.
  function renderOpenCardCta(itemId) {
    return `
      <a href="#" class="cardquant-open-card" data-item-id="${itemId}">
        <span class="cardquant-open-card-badge">CQ</span>
        <span class="cardquant-open-card-text">
          <span class="cardquant-open-card-title">Ouvrir la fiche sur CardQuant</span>
          <span class="cardquant-open-card-sub">HISTORIQUE · POP PSA · VENTES</span>
        </span>
        <span class="cardquant-open-card-arrow">${icon("external", 14)}</span>
      </a>
    `;
  }

  function renderFooter() {
    return `
      <div class="cardquant-footer-row">
        <span class="cardquant-footer-disclaimer">Prix indicatifs agrégés de sources tierces. Pas un conseil d'investissement.</span>
        <button type="button" class="cardquant-signout">Se déconnecter</button>
      </div>
    `;
  }

  function renderVerdict(data, original, currentGrade) {
    if (data.status === "ambiguous") {
      // Jusqu'à 8 (déjà triés par pricing/matching.py, meilleur score en
      // premier), miniature à l'appui -- assez pour trancher visuellement
      // les cas réels observés (Manga/Alternate Art/Parallel... souvent
      // indissociables au texte seul, cf. commit matching). Au-delà, un
      // mur de vignettes cesserait d'aider plus qu'il n'encombre ; le
      // reste reste compté, pas listé.
      const top = data.candidates.slice(0, 8);
      const rest = data.candidates.length - top.length;
      return `
        <p>Plusieurs cartes possibles — clique la bonne :</p>
        <ul class="cardquant-candidate-list">${top.map(renderCandidate).join("")}</ul>
        ${rest > 0 ? `<p class="cardquant-candidate-more">+ ${pluralFr(rest, "autre")} possible${rest > 1 ? "s" : ""} au total.</p>` : ""}
        <button type="button" class="cardquant-signout">Se déconnecter</button>
      `;
    }
    // "ok" = succès (cf. shared/verdict.py::compute_verdict_for_card,
    // pricing_api/main.py::post_verdict -- status=outcome.status). Toute
    // autre valeur ("not_found", "card_not_found", "no_reference_price")
    // n'est PAS "carte non identifiée" par défaut : "no_reference_price"
    // veut dire que la carte a bien été trouvée (data.card présent), juste
    // sans prix de référence -- les autres signaux restent affichés, cf.
    // renderCardDetail.
    if (data.status === "no_reference_price" && data.card) {
      return renderCardDetail(data, original, currentGrade);
    }
    if (data.status !== "ok" || !data.card) {
      // Passage 2 offert à l'utilisateur seulement si le titre a vraiment
      // échoué (pas "ambiguous"/"no_reference_price", déjà retournés plus
      // haut) ET qu'une photo est trouvable sur la page ET qu'on n'a pas
      // déjà essayé l'image pour cette tentative (cf. requestVerdict --
      // pas de 3e passage, cohérent avec "ne jamais deviner" §01 : si OCR
      // échoue aussi, on s'arrête là).
      const tryImage = !lastAttemptUsedImage && findListingImageUrl()
        ? '<button type="button" class="cardquant-try-image">Essayer avec la photo de l\'annonce</button>'
        : "";
      return `<p>${escapeHtml(data.message || "Carte non identifiée.")}</p>${tryImage}<button type="button" class="cardquant-signout">Se déconnecter</button>`;
    }
    return renderCardDetail(data, original, currentGrade);
  }

  // Grade actuel de la session (persiste tant que la page n'est pas
  // rechargée) -- auto-détecté depuis le titre à chaque nouvelle requête
  // TANT QUE l'utilisateur ne l'a pas corrigé lui-même (cf. le select dans
  // renderGradeBadge) ; un changement manuel prime et redéclenche
  // /verdict, jamais recalculé côté client (le grade change tout le
  // pricing, cf. shared/verdict.py).
  let currentGrade = "ungraded";
  let gradeManuallySet = false;

  // true si la dernière tentative /verdict a utilisé la photo de l'annonce
  // (passage 1 OCR) plutôt que le titre -- suppresse le bouton "essayer
  // avec la photo" en cas de nouvel échec (pas de 3e passage, cf.
  // renderVerdict). Remis à false à chaque nouvelle requête PAR TITRE
  // (nouvelle page, changement de grade...), jamais par la tentative image
  // elle-même bien sûr.
  let lastAttemptUsedImage = false;

  // Dernière réponse /verdict reçue -- seule donnée dont ont besoin les
  // recalculs live du ROI gradation / calculateur d'arbitrage / bouton
  // "Noter l'achat" (cf. panel.onChange/onInput/onClick plus bas) : tous
  // recalculables ou postables sans rappeler /verdict.
  let lastVerdictData = null;

  // Carte confirmée via le picker de désambiguïsation (renderCandidate),
  // s'il y en a une -- "sticky" pour le reste de la session de cet onglet :
  // un changement de grade après sélection doit continuer à interroger LA
  // carte choisie, jamais retomber sur identify_card() et perdre le choix
  // de l'utilisateur (cf. le onChange du grade select plus bas).
  let confirmedCardId = null;

  // Libellé du bouton watchlist à partir de FavoriteStatusResponse (cf.
  // pricing_api/schemas.py) -- "count/limit" affiché seulement pour un
  // compte gratuit (limit === -1 pour premium, cf. pricing/favorites.py::
  // is_premium, jamais affiché comme "count/-1").
  function favoriteButtonLabel(status) {
    if (status.is_favorited) return "Dans ma watchlist";
    const suffix = status.limit >= 0 ? ` (${status.count}/${status.limit})` : "";
    if (!status.is_premium && status.limit >= 0 && status.count >= status.limit) {
      return `Limite atteinte${suffix}`;
    }
    return `Suivre${suffix}`;
  }

  // Applique un FavoriteStatusResponse au bouton DÉJÀ présent dans le DOM
  // (cf. renderActionsRow) -- ne le recrée jamais, seulement son texte/
  // état, pour ne pas perdre le focus clavier si l'utilisateur vient de
  // cliquer dessus.
  function applyFavoriteStatus(btn, status) {
    btn.dataset.favorited = status.is_favorited ? "true" : "false";
    btn.querySelector("span:last-child").textContent = favoriteButtonLabel(status);
    btn.classList.toggle("cardquant-action-btn--active", status.is_favorited);
    const atLimit = !status.is_favorited && !status.is_premium && status.limit >= 0 && status.count >= status.limit;
    btn.disabled = atLimit;
  }

  // Interroge GET /favorites/{item_id} (jamais deviné depuis /verdict, qui
  // n'a aucune notion de favoris) et met à jour le bouton -- appelé juste
  // après chaque nouveau verdict avec carte identifiée (cf. requestVerdict)
  // et après chaque add/remove réussi (cf. le handler de clic plus bas).
  // Vérifie que le bouton pour CET item_id existe toujours avant d'écrire
  // dedans : le panneau a pu re-render sur une autre carte pendant l'aller-
  // retour réseau (nouvelle page, nouveau grade...), auquel cas la réponse
  // est déjà périmée -- jamais appliquée à la mauvaise carte.
  async function refreshFavoriteStatus(panel, itemId) {
    const response = await sendMessage({ type: "CARDQUANT_FAVORITE_STATUS", itemId });
    const btn = panel.root.querySelector(`.cardquant-favorite-btn[data-item-id="${itemId}"]`);
    if (!btn) return;
    if (!response || !response.ok) {
      btn.querySelector("span:last-child").textContent = "Watchlist indisponible";
      btn.disabled = true;
      return;
    }
    applyFavoriteStatus(btn, response.data);
  }

  async function requestVerdict(panel, selectedCardId = confirmedCardId, useImage = false) {
    if (selectedCardId != null) confirmedCardId = selectedCardId;
    panel.setLoading();
    lastAttemptUsedImage = useImage;
    const title = queryFirstText(TITLE_SELECTORS);
    const rawPrice = queryFirstText(PRICE_SELECTORS);
    const displayedPrice = parsePrice(rawPrice);

    let imageUrl = null;
    if (useImage) {
      imageUrl = findListingImageUrl();
      if (!imageUrl) {
        panel.setError("Aucune photo trouvable sur cette annonce.");
        return;
      }
    } else if (!title) {
      panel.setError("Titre ou prix introuvable sur cette page (sélecteurs à ajuster ?).");
      return;
    }
    if (displayedPrice == null) {
      panel.setError("Titre ou prix introuvable sur cette page (sélecteurs à ajuster ?).");
      return;
    }

    if (!gradeManuallySet && title) {
      currentGrade = detectGrade(title);
    }

    // pricing_api ne raisonne qu'en USD (prix de référence PriceCharting,
    // cf. shared/verdict.py) : une devise non détectée ne peut pas être
    // convertie de façon fiable -- on refuse plutôt que de deviner (même
    // philosophie que le reste du matching, §01 du handoff). Une devise
    // détectée (EUR/GBP/...) est convertie côté background (lib/fx.js)
    // avant l'appel à l'API.
    const currency = detectCurrency(rawPrice);
    if (!currency) {
      panel.setError("Devise non reconnue sur cette page -- comparaison impossible.");
      return;
    }

    const response = await sendMessage({
      type: "CARDQUANT_GET_VERDICT", text: useImage ? null : title, imageUrl,
      displayedPrice, currency, grade: currentGrade, selectedCardId,
    });
    if (!response || !response.ok) {
      if (response?.reason === "auth") {
        panel.setSignedOut("Session expirée, reconnecte-toi.");
        return;
      }
      if (response?.reason === "fx") {
        panel.setError(`Conversion ${currency} → USD indisponible pour l'instant, réessaie plus tard.`);
        return;
      }
      panel.setError("Verdict indisponible (pricing_api injoignable).");
      return;
    }
    lastVerdictData = response.data;
    panel.setVerdict(response.data, response.convertedFrom ? { amount: displayedPrice, currency } : null, currentGrade);

    // Bouton watchlist affiché uniquement quand renderCardDetail l'est
    // (cf. renderVerdict) -- même condition ("carte identifiée", statuts
    // 'ok'/'no_reference_price' avec data.card), dupliquée ici faute de
    // pouvoir lire l'état déjà décidé par renderVerdict depuis l'extérieur.
    const showsCardDetail = response.data.card
      && (response.data.status === "ok" || response.data.status === "no_reference_price");
    if (showsCardDetail) refreshFavoriteStatus(panel, response.data.card.card_id);
  }

  async function refresh(panel) {
    const { session } = (await sendMessage({ type: "CARDQUANT_GET_SESSION" })) || {};
    panel.setUser(session);
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

  panel.onClick(".cardquant-signin", () => {
    // Ouvre le site dans un nouvel onglet -- la connexion (Google Sign-In)
    // s'y fait réellement (cf. web/components/auth/AuthModal.tsx), puis la
    // session est relayée ici automatiquement (cf. chrome.storage.onChanged
    // ci-dessous, jamais besoin de revenir cliquer sur cet onglet).
    sendMessage({ type: "CARDQUANT_OPEN_SITE_LOGIN" });
  });

  panel.onClick(".cardquant-signout", async () => {
    await sendMessage({ type: "CARDQUANT_SIGN_OUT" });
    panel.setSignedOut();
  });

  // "Ouvrir la fiche sur CardQuant" -- cf. renderOpenCardCta,
  // background.js::CARDQUANT_OPEN_CARD.
  panel.onClick(".cardquant-open-card", (el) => {
    const itemId = Number(el.getAttribute("data-item-id"));
    if (itemId) sendMessage({ type: "CARDQUANT_OPEN_CARD", itemId });
  });

  // Picker de désambiguïsation : clic (ou Entrée/Espace, cf. onKeydown) sur
  // un candidat -> relance /verdict directement sur cette carte, sans
  // repasser par identify_card() (cf. requestVerdict, background.js).
  const selectCandidate = (el) => {
    const cardId = el.getAttribute("data-card-id");
    if (cardId) requestVerdict(panel, Number(cardId));
  };
  panel.onClick(".cardquant-candidate", selectCandidate);
  panel.onKeydown(".cardquant-candidate", selectCandidate);
  panel.onImgError(".cardquant-candidate-thumb", (el) => el.remove());

  // Passage 2 (OCR sur la photo de l'annonce) -- cf. renderVerdict pour la
  // condition d'affichage du bouton et requestVerdict pour le mode useImage.
  panel.onClick(".cardquant-try-image", () => requestVerdict(panel, undefined, true));

  // Watchlist : toggle add/remove sur la carte actuellement affichée (cf.
  // renderActionsRow/refreshFavoriteStatus plus haut). `data-favorited`
  // décide le sens (déjà "true"/"false", jamais "unknown" à ce stade
  // puisque le bouton reste disabled tant que refreshFavoriteStatus n'a
  // pas répondu).
  panel.onClick(".cardquant-favorite-btn", async (btn) => {
    const itemId = Number(btn.getAttribute("data-item-id"));
    const wasFavorited = btn.dataset.favorited === "true";
    const previousLabel = btn.querySelector("span:last-child").textContent; // restauré tel quel en cas d'échec
    const note = panel.root.querySelector(".cardquant-favorite-note");
    if (note) { note.hidden = true; note.textContent = ""; }
    btn.disabled = true;
    btn.querySelector("span:last-child").textContent = "…";

    const response = await sendMessage({
      type: wasFavorited ? "CARDQUANT_FAVORITE_REMOVE" : "CARDQUANT_FAVORITE_ADD",
      itemId,
    });
    if (!response || !response.ok) {
      if (response?.reason === "auth") {
        panel.setSignedOut("Session expirée, reconnecte-toi.");
        return;
      }
      if (note) {
        note.hidden = false;
        // Message serveur tel quel pour "limit" (cf. pricing_api/main.py::
        // post_favorite, le seuil FREE_FAVORITES_LIMIT vit côté serveur,
        // jamais réinventé ici) -- texte générique en repli seulement pour
        // une vraie panne réseau.
        note.textContent = response?.reason === "limit"
          ? (response.message || "Limite de favoris gratuits atteinte.")
          : "Watchlist indisponible pour le moment, réessaie plus tard.";
      }
      btn.querySelector("span:last-child").textContent = previousLabel;
      btn.disabled = false;
      return;
    }
    await refreshFavoriteStatus(panel, itemId);
  });

  // "Noter l'achat" : journalise une position au portefeuille (écran PnL du
  // site) au prix affiché de l'annonce (déjà en USD, cf. lastVerdictData),
  // grade courant, quantité 1, date du jour -- cf. background.js::
  // CARDQUANT_PORTFOLIO_ADD. Pas de mini-formulaire dans le panneau : tout
  // est déjà connu, et la position reste éditable/supprimable ensuite sur
  // /pnl (montant, quantité, date de vente...).
  panel.onClick(".cardquant-portfolio-btn", async (btn) => {
    if (!lastVerdictData || !lastVerdictData.card) return;
    const note = panel.root.querySelector(".cardquant-portfolio-note");
    if (note) { note.hidden = true; note.textContent = ""; }
    const previousHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `${icon("wallet")}<span>…</span>`;

    const response = await sendMessage({
      type: "CARDQUANT_PORTFOLIO_ADD",
      itemId: lastVerdictData.card.card_id,
      grade: currentGrade,
      buyPrice: lastVerdictData.displayed_price,
      buyCurrency: "USD",
      buyDate: new Date().toISOString().slice(0, 10),
    });
    if (!response || !response.ok) {
      if (response?.reason === "auth") {
        panel.setSignedOut("Session expirée, reconnecte-toi.");
        return;
      }
      btn.innerHTML = previousHtml;
      btn.disabled = false;
      if (note) { note.hidden = false; note.textContent = "Ajout au portefeuille indisponible pour le moment, réessaie plus tard."; }
      return;
    }
    btn.innerHTML = `${icon("wallet")}<span>Ajouté ✓</span>`;
    btn.classList.add("cardquant-action-btn--active");
    if (note) { note.hidden = false; note.textContent = "Position ajoutée à ton portefeuille -- modifiable sur l'onglet PnL du site."; }
  });

  panel.onChange(".cardquant-grade-select", (el) => {
    currentGrade = el.value;
    gradeManuallySet = true;
    requestVerdict(panel);
  });

  // ROI gradation : recalcule et re-rend UNIQUEMENT le bloc de sortie
  // (.cardquant-groi-output), jamais tout le panneau ni un appel /verdict --
  // les hypothèses (palier, frais...) ne changent aucune donnée serveur,
  // seulement le calcul client (cf. lib/gradingRoi.js).
  function recomputeGroi() {
    if (!lastVerdictData || !lastVerdictData.grading_roi_inputs) return;
    const section = document.querySelector("#cardquant-groi");
    if (!section) return;
    const tierSel = section.querySelector(".cardquant-groi-tier");
    const readNum = (sel, fallback) => {
      const v = parseFloat(section.querySelector(sel).value);
      return Number.isFinite(v) ? v : fallback;
    };
    const A = window.CardQuantGradingRoi.DEFAULT_ASSUMPTIONS;
    const assumptions = {
      serviceTierId: tierSel.value || undefined,
      extraCostsUsd: readNum(".cardquant-groi-extra", A.extraCostsUsd),
      lowGradeProbabilityPct: readNum(".cardquant-groi-lowp", A.lowGradeProbabilityPct),
      lowGradeValueFactor: A.lowGradeValueFactor,
      resaleFeePct: readNum(".cardquant-groi-fee", A.resaleFeePct),
    };
    section.querySelector(".cardquant-groi-output").innerHTML =
      renderGroiOutput(lastVerdictData.grading_roi_inputs, assumptions);
  }
  panel.onChange(".cardquant-groi-tier", recomputeGroi);
  panel.onInput(".cardquant-groi-extra, .cardquant-groi-lowp, .cardquant-groi-fee", recomputeGroi);

  // Calculateur d'arbitrage : même principe, aucun appel réseau -- réutilise
  // reference_price déjà connu (cf. renderArbitrageCalculatorRow).
  function recomputeArbitrage() {
    if (!lastVerdictData || lastVerdictData.reference_price == null) return;
    const section = document.querySelector("#cardquant-arb");
    if (!section) return;
    const readNum = (sel) => {
      const v = parseFloat(section.querySelector(sel).value);
      return Number.isFinite(v) ? v : 0;
    };
    const buy = readNum(".cardquant-arb-buy");
    const ship = readNum(".cardquant-arb-ship");
    const customs = readNum(".cardquant-arb-customs");
    section.querySelector(".cardquant-arb-output").innerHTML =
      renderArbitrageOutput(lastVerdictData.reference_price, buy, ship, customs);
  }
  panel.onInput(".cardquant-arb-buy, .cardquant-arb-ship, .cardquant-arb-customs", recomputeArbitrage);

  // Le site relaie la session dès la connexion (cf. background.js
  // onMessageExternal) -- ce listener capte l'écriture dans
  // chrome.storage.local qui en résulte et relance le verdict sans que
  // l'utilisateur ait besoin de revenir sur cet onglet ni de re-cliquer.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && "cardquant_session" in changes) {
      const session = changes.cardquant_session.newValue;
      panel.setUser(session || null);
      if (session) requestVerdict(panel);
    }
  });

  refresh(panel);
})();
