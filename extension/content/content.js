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
 * display scellé viennent TOUJOURS de la réponse /verdict (pricing_api) --
 * jamais recalculés ni inventés ici, cf. pricing_api/schemas.py pour le
 * contrat exact.
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

  function sendMessage(message) {
    return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
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
        <span class="cardquant-brand">CardQuant</span>
        <span id="cardquant-status" class="cardquant-status cardquant-status--pending">…</span>
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

    function setStatus(text, tone) {
      const el = status();
      el.textContent = text;
      el.className = "cardquant-status" + (tone ? ` cardquant-status--${tone}` : "");
    }

    return {
      root,
      toggle: () => setOpen(!open),
      setOpen,
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
    // lequel en scannant vite la liste. Étapes précédentes de ce même
    // repère, dans l'ordre : emoji drapeau (LANGUAGE_FLAGS) écarté après
    // vérif en conditions réelles -- rendu dépendant d'une police emoji
    // que Windows n'a pas toujours pour les drapeaux (retombe sur le code
    // pays en texte minuscule) ; puis badge texte coloré, fonctionnel mais
    // pas ce que l'utilisateur demandait ("un petit drapeau"). Mini-drapeau
    // SVG (LANGUAGE_FLAG_SVG) à la place : dessiné à la main, aucune
    // dépendance à une police, identique sur toute plateforme -- cf.
    // panel.css pour les couleurs. Élément à part plutôt que fondu dans
    // .cardquant-candidate-name : celle-ci tronque en ellipsis sur les
    // noms longs, un préfixe à l'intérieur finirait caché.
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
    return `
      <span class="cardquant-badge cardquant-grade-wrap">
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
  // façon fiable (des cartes de sets clairement promo/événementiels
  // gardent leur rareté normale, ex. "Secret Rare") -- le nom du set
  // (souvent explicite : "... Pre-Release Cards", "... Promotion Cards")
  // et la rareté réelle sont affichés bruts, à l'utilisateur de juger,
  // jamais une classification binaire devinée à sa place.
  function formatSetBadge(card) {
    if (!card.set_name) return null;
    const year = card.set_release_year ? ` (${card.set_release_year})` : "";
    // "One Piece" en dur : l'extension ne couvre que ce jeu pour l'instant
    // (cf. manifest.json, pricing/matching.py) -- à remplacer par un vrai
    // champ si un 2e TCG est ajouté un jour.
    return `One Piece · ${card.set_name}${year}`;
  }

  function renderMeta(data, currentGrade) {
    const { base, qualifier } = splitQualifier(data.card.name);
    const setBadge = formatSetBadge(data.card);
    const lang = data.card.language;
    return `
      <p class="cardquant-card-name">${escapeHtml(base)}</p>
      ${qualifier || data.card.code
        ? `<p class="cardquant-card-qualifier">${[qualifier, data.card.code].filter(Boolean).map(escapeHtml).join(" · ")}</p>`
        : ""}
      <div class="cardquant-badge-row">
        ${lang ? `<span class="cardquant-badge">${LANGUAGE_FLAG_SVG[lang] || ""}${escapeHtml(LANGUAGE_NAMES[lang] || lang)}</span>` : ""}
        ${setBadge ? `<span class="cardquant-badge">${escapeHtml(setBadge)}</span>` : ""}
        ${data.card.rarity ? `<span class="cardquant-badge">${escapeHtml(data.card.rarity)}</span>` : ""}
        ${renderGradeBadge(currentGrade)}
      </div>
    `;
  }

  // Seuils de LABEL uniquement (présentation) -- le score 0-100 lui-même
  // n'est calculé qu'une fois, côté serveur (pricing/opportunity_score.py),
  // jamais recalculé ici. Premier jet, à recalibrer avec les mêmes retours
  // d'usage que les poids serveur (OPPORTUNITY_WEIGHT_*).
  function gaugeBucket(score) {
    if (score >= 65) return { text: "Bonne affaire", tone: "positive" };
    if (score >= 35) return { text: "Prix correct", tone: "warn" };
    return { text: "Mauvaise affaire", tone: "negative" };
  }

  function renderGauge(score) {
    const bucket = score == null ? null : gaugeBucket(score);
    return `
      <div class="cardquant-section">
        <div class="cardquant-section-header">
          <p class="cardquant-section-title">Score d'opportunité</p>
          <span class="cardquant-gauge-label cardquant-${bucket ? bucket.tone : "muted"}">${escapeHtml(bucket ? bucket.text : "Indisponible")}</span>
        </div>
        <div class="cardquant-gauge${score == null ? " cardquant-gauge--indeterminate" : ""}">
          ${score != null ? `<div class="cardquant-gauge-cursor" style="left:${score}%"></div>` : ""}
        </div>
        <div class="cardquant-gauge-scale">
          <span>Mauvaise</span><span>Correcte</span><span>Excellente</span>
        </div>
        ${score == null ? '<p class="cardquant-gauge-note">Pas encore de prix de référence pour cette carte -- score indisponible.</p>' : ""}
      </div>
    `;
  }

  function renderDeltaRow(data) {
    const deltaAbs = data.displayed_price - data.reference_price;
    const deltaPct = (deltaAbs / data.reference_price) * 100;
    const sign = deltaAbs > 0 ? "+" : deltaAbs < 0 ? "−" : "±";
    const tone = data.verdict === "green" ? "positive" : data.verdict === "red" ? "negative" : "warn";
    return `<dt>Écart vs marché</dt><dd class="cardquant-${tone}">${sign}${Math.abs(deltaAbs).toFixed(2)} $ (${sign}${Math.abs(deltaPct).toFixed(0)}%)</dd>`;
  }

  // "Analyse de prix" : prix annonce (DOM) + prix de marché + médiane
  // récente/moy. 10 ventes + écart vs marché (tous pricing_api, cf.
  // pricing/sales_stats.py côté serveur) -- lignes absentes si aucune
  // vente connue (jamais 0 $ affiché comme une vraie moyenne).
  //
  // Ligne "Prix de marché" -- demande utilisateur (2026-08-23) : l'écart
  // ("Écart vs marché" plus bas, cf. renderDeltaRow) était affiché SANS le
  // chiffre dont il est l'écart -- reference_price (prix PriceCharting du
  // moment, cf. shared/verdict.py::compute_verdict_for_card, TOUJOURS en
  // USD) n'apparaissait nulle part par lui-même, seulement caché dans le
  // calcul du delta. Étiquetée "(PriceCharting)" pour ne pas la confondre
  // avec la médiane récente/moy. 10 dernières ventes juste en dessous : deux "marchés"
  // différents (catalogue PriceCharting vs ventes eBay réellement conclues)
  // qui peuvent diverger, cf. le commentaire de compute_extended_signals
  // sur opportunity_reference -- même raison qui a fait switcher le score
  // d'opportunité vers les ventes réelles (commit 9a2815d), mais le verdict
  // vert/jaune/rouge et cette ligne d'écart, eux, restent volontairement
  // comparés à reference_price (cf. shared/verdict.py::classify, inchangé).
  function renderPriceAnalysis(data, original) {
    const stats = data.sales_stats;
    const rows = [];
    const originalNote = original
      ? ` <span class="cardquant-muted-inline">(${original.amount.toFixed(2)} ${CURRENCY_SYMBOLS[original.currency] || original.currency})</span>`
      : "";
    rows.push(`<dt>Prix d'annonce</dt><dd>${formatMoney(data.displayed_price, "USD")}${originalNote}</dd>`);
    if (data.reference_price != null) {
      rows.push(`<dt>Prix de marché <span class="cardquant-muted-inline">(PriceCharting)</span></dt><dd>${formatMoney(data.reference_price, "USD")}</dd>`);
    }
    if (stats && stats.median_recent != null) {
      // Taille de fenêtre toujours affichée (pas juste si < nominal) --
      // contrairement à moy. 10 ci-dessous, la fenêtre est adaptative
      // (3 à 5 ventes selon leur densité temporelle, cf.
      // pricing/sales_stats.py) donc "3" n'est plus un défaut implicite.
      rows.push(`<dt>Médiane ventes récentes (${stats.sample_size_recent})</dt><dd>${formatMoney(stats.median_recent, stats.currency)}</dd>`);
    }
    if (stats && stats.avg_last_10 != null) {
      const note = stats.sample_size_10 < 10 ? ` (${stats.sample_size_10})` : "";
      rows.push(`<dt>Moy. 10 dernières ventes${note}</dt><dd>${formatMoney(stats.avg_last_10, stats.currency)}</dd>`);
    }
    if (data.reference_price != null) {
      rows.push(renderDeltaRow(data));
    }
    return `
      <div class="cardquant-section">
        <p class="cardquant-section-title">Analyse de prix</p>
        <dl class="cardquant-analysis-list">${rows.join("")}</dl>
      </div>
    `;
  }

  // Sections "pliantes" -- demande utilisateur (2026-08-23) : trop
  // d'information affichée d'un coup. Score d'opportunité, infos carte,
  // analyse de prix et display scellé restent toujours visibles (l'essentiel
  // pour décider vite) ; liquidité, comparaison par langue, ROI gradation et
  // calculateur d'arbitrage sont repliés par défaut, un clic suffit à les
  // ouvrir. <details>/<summary> natifs plutôt qu'un accordéon maison : clavier
  // (Entrée/Espace) et focus visible gratuits, pas de JS de toggle à écrire
  // ni d'état à mémoriser ici -- chaque section s'ouvre/ferme indépendamment
  // des autres, refermée à chaque nouveau verdict comme tout #cardquant-body
  // (cf. panel.setVerdict/setLoading, qui remplacent le innerHTML en entier).
  function renderCollapsible(title, bodyHtml, id) {
    return `
      <details class="cardquant-section cardquant-collapsible"${id ? ` id="${id}"` : ""}>
        <summary class="cardquant-collapsible-title">${title}</summary>
        <div class="cardquant-collapsible-body">${bodyHtml}</div>
      </details>
    `;
  }

  const LIQUIDITY_STATUS = {
    liquide: { text: "Marché liquide", tone: "positive" },
    modere: { text: "Marché modéré", tone: "warn" },
    illiquide: { text: "Marché illiquide", tone: "negative" },
  };

  // active_listings peut être `null` -- PAS 0 -- cf.
  // pricing/repository.py::fetch_latest_active_listing_count. Afficher "—"
  // plutôt qu'un faux 0 est la seule option honnête ici. Depuis le passage
  // à la demande (2026-08-22, cf. pricing/active_listings_source.py -- un
  // premier essai en batch par rotation, ~5 semaines/cycle, a été retiré la
  // même semaine : trop lent pour aider une vraie décision d'achat), un
  // single avec un `code` est scrapé EN DIRECT au moment de cette
  // consultation si pas déjà fait aujourd'hui -- `null` ne veut donc plus
  // dire "en attente de rotation", juste : échec ponctuel du scrape (quota
  // eBay, réseau...) ou carte sans `code` exploitable (scellé/single, même
  // garde que le reste du matching -- "ne jamais deviner").
  //
  // 'graded' (valeur unique en base pour toute note PSA) = toutes notes
  // confondues, PAS une note précise -- eBay ne permet pas de filtrer plus
  // finement (cf. ingestion/sources/ebay.py). Le chiffre reste affiché,
  // mais annoté pour ne jamais laisser croire à un compte "PSA 10
  // uniquement" quand grade !== 'ungraded'.
  function renderLiquidity(liquidity, grade) {
    if (!liquidity) return "";
    const status = LIQUIDITY_STATUS[liquidity.label] || { text: liquidity.label, tone: "muted" };
    const isGraded = grade !== "ungraded";
    const note = liquidity.active_listings == null
      ? "<p class=\"cardquant-todo\">Annonces actives : indisponibles pour cette carte pour le moment.</p>"
      : "";
    return renderCollapsible("Liquidité · 3 derniers mois", `
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
    `);
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

  // Une seule ligne d'arbitrage (l'écart le plus marqué), pas un mur de
  // pourcentages -- et seulement si l'écart est assez grand pour être un
  // signal utile, pas du bruit d'arrondi.
  function renderArbitrageNote(entries, current) {
    if (!current || current.price == null) return "";
    let best = null;
    for (const e of entries) {
      if (e.is_current_listing || e.price == null) continue;
      const pct = ((e.price - current.price) / current.price) * 100;
      if (!best || Math.abs(pct) > Math.abs(best.pct)) best = { entry: e, pct };
    }
    if (!best || Math.abs(best.pct) < 15) return "";
    const name = (LANGUAGE_NAMES[best.entry.language] || best.entry.language).toLowerCase();
    const direction = best.pct > 0 ? "plus cher" : "moins cher";
    return `<p class="cardquant-arbitrage-note">L'équivalent ${escapeHtml(name)} se vend ${Math.abs(best.pct).toFixed(0)}% ${direction} — arbitrage possible.</p>`;
  }

  function renderLanguageComparison(entries) {
    if (!entries || entries.length < 2) return ""; // aucune langue sœur connue -- rien à comparer
    const current = entries.find((e) => e.is_current_listing);
    return renderCollapsible("Comparaison par langue", `
        <div class="cardquant-lang-list">${entries.map((e) => renderLanguageRow(e, current)).join("")}</div>
        ${renderArbitrageNote(entries, current)}
    `);
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

  function renderGradingRoi(inputs) {
    const R = window.CardQuantGradingRoi;
    if (!inputs) {
      return renderCollapsible(
        "ROI gradation",
        '<p class="cardquant-todo">Pas encore de données de gradation pour cette carte (calculées une fois par cycle de synchro).</p>',
      );
    }
    const A = R.DEFAULT_ASSUMPTIONS;
    const { candidate } = groiCandidateFromInputs(inputs);
    const suggested = R.suggestServiceTier(candidate);
    return renderCollapsible("ROI gradation", `
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
    `, "cardquant-groi");
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

  function renderArbitrageCalculator(data) {
    const ref = data.reference_price;
    if (ref == null) {
      return renderCollapsible(
        "Calculateur d'arbitrage",
        '<p class="cardquant-todo">Pas de prix de référence pour cette carte -- calculateur indisponible.</p>',
      );
    }
    return renderCollapsible("Calculateur d'arbitrage", `
        <p class="cardquant-arb-ref">Prix de revente moyen : <strong>${formatMoney(ref, "USD")}</strong> <span class="cardquant-muted-inline">(même référence que le verdict)</span></p>
        <div class="cardquant-arb-inputs">
          <label>Achat ($)<input type="number" min="0" step="0.01" class="cardquant-arb-buy" value="0"></label>
          <label>Livraison ($)<input type="number" min="0" step="0.01" class="cardquant-arb-ship" value="0"></label>
          <label>Douane ($)<input type="number" min="0" step="0.01" class="cardquant-arb-customs" value="0"></label>
        </div>
        <div class="cardquant-arb-output">${renderArbitrageOutput(ref, 0, 0, 0)}</div>
    `, "cardquant-arb");
  }

  // Liens de double-vérification vers PriceCharting -- demande utilisateur
  // (2026-08-22, étendu 2026-08-23). PriceCharting est en plus la source
  // même du prix de référence (cf. shared/verdict.py::
  // compute_verdict_for_card), donc pertinent à vérifier. Chaque lien
  // pointe vers la VRAIE page produit exacte -- déjà résolue par le
  // scrape/matching serveur (pricing/sources/pricecharting_source.py::
  // _find_row_for_card), exposée ici via sources_compared[].url /
  // language_comparison[].url plutôt que reconstruite/devinée côté
  // extension. Absent (pas de bouton) si PriceCharting n'a pas matché cette
  // langue -- jamais un lien de recherche de repli qui laisserait croire à
  // un lien exact.
  //
  // Un 2e bouton par langue sœur connue (cf. shared/verdict.py::
  // _build_language_comparison) -- demande utilisateur (2026-08-23) :
  // comparer d'un clic la fiche PriceCharting de l'AUTRE langue sans
  // ressaisir la recherche à la main. Drapeau devant chaque lien (même
  // repère que le reste du panneau, cf. LANGUAGE_FLAG_SVG) : avec 2+
  // boutons empilés, le texte seul ne suffit plus à distinguer vite lequel
  // est lequel.
  //
  // Bouton "Analyse complète sur CardQuant" (renderCta) et lien Cardmarket
  // (renderCardmarketLink, recherche faute d'ID exploitable) retirés le
  // 2026-08-23 à la demande utilisateur -- CARDQUANT_OPEN_CARD
  // (background.js) supprimé avec eux, plus rien ne l'envoie.
  function renderVerificationLink(url, language, label) {
    if (!url) return "";
    const flag = LANGUAGE_FLAG_SVG[language] || "";
    return `<a class="cardquant-cardmarket-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${flag}${escapeHtml(label)} ↗</a>`;
  }

  function renderVerificationLinks(data) {
    const currentSource = (data.sources_compared || []).find((s) => s.source === "pricecharting" && s.url);
    const currentLink = renderVerificationLink(currentSource?.url, data.card.language, "Vérifier sur PriceCharting");
    const siblingLinks = (data.language_comparison || [])
      .filter((e) => !e.is_current_listing && e.url)
      .map((e) => renderVerificationLink(
        e.url, e.language,
        `Voir la version ${(LANGUAGE_NAMES[e.language] || e.language).toLowerCase()} sur PriceCharting`,
      ))
      .join("");
    if (!currentLink && !siblingLinks) return "";
    // .cardquant-section (filet du haut, cf. panel.css) plutôt qu'un <div>
    // nu -- sert de divider avec la dernière section d'analyse au-dessus
    // (score/analyse de prix/liquidité/langue/ROI/arbitrage), demande
    // utilisateur (2026-08-23) : ce bloc est une action ("vérifier
    // ailleurs"), pas une donnée d'analyse de plus, à séparer visuellement.
    return `<div class="cardquant-section cardquant-verify-links">${currentLink}${siblingLinks}</div>`;
  }

  // Vue commune "carte identifiée" (statuts 'ok' et 'no_reference_price') --
  // tous les blocs sont défensifs (rien affiché si la donnée n'est pas là),
  // cf. pricing_api/schemas.py pour ce qui est None dans quel cas.
  function renderCardDetail(data, original, currentGrade) {
    const hasVerdict = data.status === "ok" && data.verdict;
    return `
      ${renderMeta(data, currentGrade)}
      ${hasVerdict ? `<p class="cardquant-pill cardquant-pill--${data.verdict}">${escapeHtml(VERDICT_LABELS[data.verdict] || data.verdict)}</p>` : ""}
      ${renderGauge(data.opportunity_score)}
      ${renderPriceAnalysis(data, original)}
      ${renderLiquidity(data.liquidity, data.grade)}
      ${renderLanguageComparison(data.language_comparison)}
      ${renderSealedDisplay(data.sealed_display_price)}
      ${renderGradingRoi(data.grading_roi_inputs)}
      ${renderArbitrageCalculator(data)}
      ${renderVerificationLinks(data)}
      <button type="button" class="cardquant-signout">Se déconnecter</button>
    `;
  }

  function renderVerdict(data, original, currentGrade) {
    const footer = '<button type="button" class="cardquant-signout">Se déconnecter</button>';
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
        ${footer}
      `;
    }
    // "ok" = succès (cf. shared/verdict.py::compute_verdict_for_card,
    // pricing_api/main.py::post_verdict -- status=outcome.status). Toute
    // autre valeur ("not_found", "card_not_found", "no_reference_price")
    // n'est PAS "carte non identifiée" par défaut : "no_reference_price"
    // veut dire que la carte a bien été trouvée (data.card présent), juste
    // sans prix de référence -- les autres signaux (moy. ventes, liquidité,
    // comparaison langue) restent affichés, cf. renderCardDetail.
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
      return `<p>${escapeHtml(data.message || "Carte non identifiée.")}</p>${tryImage}${footer}`;
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
  // recalculs live du ROI gradation / calculateur d'arbitrage (cf.
  // panel.onChange/onInput plus bas) : les deux sont 100% client, jamais
  // besoin de rappeler /verdict quand l'utilisateur change une hypothèse.
  let lastVerdictData = null;

  // Carte confirmée via le picker de désambiguïsation (renderCandidate),
  // s'il y en a une -- "sticky" pour le reste de la session de cet onglet :
  // un changement de grade après sélection doit continuer à interroger LA
  // carte choisie, jamais retomber sur identify_card() et perdre le choix
  // de l'utilisateur (cf. le onChange du grade select plus bas).
  let confirmedCardId = null;

  // `selectedCardId` : carte cliquée dans le picker de désambiguïsation
  // (renderCandidate) -- titre/prix/devise/grade viennent toujours du DOM
  // comme d'habitude (rien de spécifique à l'identité de la carte), mais
  // pricing_api saute identify_card() entièrement côté serveur quand il est
  // présent (cf. background.js, pricing_api/main.py::post_verdict). Défaut
  // = la carte déjà confirmée, s'il y en a une (voir confirmedCardId).
  // `useImage` : passage 2 déclenché par le bouton "essayer avec la photo"
  // (cf. renderVerdict) -- envoie image_url à la place de text, forçant
  // pricing_api sur le repli OCR (identify_card() n'utilise image_url QUE
  // si text est absent, cf. pricing/matching.py). Titre toujours capté pour
  // le grade auto-détecté quand il existe, mais jamais envoyé comme `text`
  // dans ce mode -- sinon le serveur retomberait sur le même match par
  // titre qui vient d'échouer.
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
  // reference_price déjà connu (cf. renderArbitrageCalculator).
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
    if (areaName === "local" && "cardquant_session" in changes && changes.cardquant_session.newValue) {
      requestVerdict(panel);
    }
  });

  refresh(panel);
})();
