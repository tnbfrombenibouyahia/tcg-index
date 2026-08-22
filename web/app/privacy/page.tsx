import type { Metadata } from "next";
import Link from "next/link";

// Page publique, hors du groupe (app) (pas de sidebar/auth requise, cf.
// app/layout.tsx -- même raisonnement que la landing page) : nécessaire
// pour la soumission Chrome Web Store, qui exige une URL publique vers la
// politique de confidentialité (§09 tcg-index-handoff.md). Contenu
// volontairement en français uniquement (comme l'extension, "FR only pour
// l'instant") -- pas de traduction next-intl ici, texte statique.
//
// Source de vérité : extension/PRIVACY_POLICY.md (même contenu, gardé en
// double faute d'un pipeline qui rendrait un Markdown depuis web/ -- à
// garder en sync à la main si l'un des deux change).

export const metadata: Metadata = {
  title: "Politique de confidentialité — CardQuant",
  description: "Quelles données CardQuant collecte, pourquoi, et comment les gérer.",
};

const LAST_UPDATED = "22 août 2026";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-10 first:mt-0">
      <h2 className="font-sans text-lg font-bold text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 sm:py-20">
      <Link href="/" className="font-mono text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
        ← CardQuant
      </Link>

      <h1 className="mt-6 font-sans text-2xl font-extrabold text-foreground sm:text-3xl">
        Politique de confidentialité
      </h1>
      <p className="mt-2 font-mono text-xs text-muted-foreground">Dernière mise à jour : {LAST_UPDATED}</p>

      <p className="mt-6 text-[15px] leading-relaxed text-foreground/90">
        Ce document couvre l&apos;extension navigateur CardQuant et le site associé
        (tcgindex.vercel.app), ci-après « CardQuant » ou « le service ». CardQuant est un
        outil d&apos;analyse de prix pour cartes à collectionner (One Piece TCG à ce jour),
        consulté en direct sur des annonces eBay.
      </p>

      <Section id="resume" title="1. Résumé">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            CardQuant lit le contenu <strong>des pages d&apos;annonce eBay que vous consultez</strong>{" "}
            (titre, prix, photo du produit) pour vous donner un verdict de prix — il ne lit
            jamais le contenu d&apos;un autre site.
          </li>
          <li>Un compte (connexion Google) est requis pour utiliser l&apos;extension.</li>
          <li>
            Aucune vente ni partage de vos données à des fins publicitaires ou commerciales.
            Aucune injection de publicité ou de lien affilié dans les pages que vous visitez.
          </li>
          <li>
            Les seuls tiers impliqués le sont pour faire fonctionner le service
            (authentification, hébergement, reconnaissance de texte sur image, taux de
            change) — jamais pour du tracking ou de la revente de données.
          </li>
        </ul>
      </Section>

      <Section id="donnees-collectees" title="2. Données collectées">
        <h3 className="font-sans text-sm font-bold text-foreground">2.1 Compte utilisateur</h3>
        <p>
          La connexion se fait par <strong>Google Sign-In</strong> via Firebase Authentication,
          exclusivement sur le site (jamais dans l&apos;extension elle-même). Nous recevons et
          stockons votre identifiant Firebase (uid), votre adresse email et le nom affiché
          associés à votre compte Google, ainsi que, si vous le personnalisez, un avatar que
          vous choisissez d&apos;uploader sur le site. CardQuant ne voit et ne stocke jamais
          votre mot de passe Google — l&apos;authentification est entièrement déléguée à
          Firebase/Google.
        </p>

        <h3 className="mt-4 font-sans text-sm font-bold text-foreground">
          2.2 Contenu des pages d&apos;annonce eBay
        </h3>
        <p>
          L&apos;extension s&apos;exécute uniquement sur les pages d&apos;annonce individuelle des
          domaines eBay suivants : ebay.com, .fr, .de, .co.uk, .it, .es, .ca, .com.au, .at,
          .ch, .ie, .nl, .be, .pl. Sur ces pages, et uniquement celles-ci, l&apos;extension lit
          le titre, le prix affiché et sa devise, et — seulement si vous cliquez « Essayer
          avec la photo de l&apos;annonce » — l&apos;URL de la photo principale du produit telle
          qu&apos;affichée sur l&apos;annonce (jamais une photo personnelle, votre webcam ou un
          fichier de votre appareil).
        </p>
        <p>
          Ce contenu est envoyé à notre service de verdict pour identifier la carte et
          calculer un prix de référence. La photo, quand elle est utilisée, est transmise à
          l&apos;API Google Cloud Vision (reconnaissance de texte uniquement) pour en extraire
          le texte imprimé. L&apos;extension ne lit jamais le contenu d&apos;un site autre qu&apos;eBay,
          ni plus que le titre/prix/photo décrits ci-dessus sur une page eBay.
        </p>

        <h3 className="mt-4 font-sans text-sm font-bold text-foreground">2.3 Historique de recherche</h3>
        <p>
          Chaque carte identifiée avec succès est associée à votre compte (identifiant de
          carte + date/heure) pour alimenter la fonctionnalité « dernières recherches » de
          l&apos;extension et du site.
        </p>

        <h3 className="mt-4 font-sans text-sm font-bold text-foreground">2.4 Session locale</h3>
        <p>
          Un jeton de session (Firebase ID token + refresh token, adresse email, nom affiché)
          est stocké localement dans votre navigateur pour éviter de vous reconnecter à
          chaque page. Cette donnée reste sur votre appareil et est effacée quand vous vous
          déconnectez.
        </p>

        <h3 className="mt-4 font-sans text-sm font-bold text-foreground">2.5 Ce que nous ne collectons pas</h3>
        <p>
          Pas de mot de passe, pas d&apos;information de paiement ou bancaire, pas d&apos;historique
          de navigation en dehors des pages d&apos;annonce eBay où l&apos;extension est active, pas
          de données issues d&apos;autres onglets ou sites, pas de cookies tiers de tracking, pas
          de vente de données à des tiers.
        </p>
      </Section>

      <Section id="utilisation" title="3. Utilisation des données">
        <p>Les données ci-dessus servent exclusivement à :</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>identifier la carte présente sur l&apos;annonce consultée ;</li>
          <li>
            calculer et afficher le verdict de prix, les statistiques de ventes, la
            liquidité, le ROI de gradation, le calculateur d&apos;arbitrage ;
          </li>
          <li>
            faire fonctionner votre compte (connexion, historique de recherche, watchlist si
            vous en créez une sur le site) ;
          </li>
          <li>
            assurer la sécurité et le bon fonctionnement du service (ex. limiter les abus des
            API tierces facturées à l&apos;usage).
          </li>
        </ul>
        <p>
          Aucune de ces données n&apos;est utilisée à des fins publicitaires, de profilage
          commercial, ou revendue à un tiers.
        </p>
      </Section>

      <Section id="partage" title="4. Partage avec des tiers">
        <p>
          CardQuant s&apos;appuie sur les services tiers suivants, chacun pour une fonction
          précise — jamais pour partager vos données à d&apos;autres fins :
        </p>
        <div className="overflow-x-auto rounded-[var(--radius-tile)] border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-alt text-left">
                <th className="px-4 py-2.5 font-sans font-semibold text-foreground">Service</th>
                <th className="px-4 py-2.5 font-sans font-semibold text-foreground">Rôle</th>
                <th className="px-4 py-2.5 font-sans font-semibold text-foreground">Donnée transmise</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Firebase Authentication (Google)", "Connexion Google Sign-In", "Identifiant de compte Google"],
                ["Google Cloud Vision", "Reconnaissance de texte sur la photo de l'annonce (si déclenché)", "URL de la photo produit eBay"],
                ["Google Cloud (Cloud Run, Cloud SQL)", "Hébergement du backend et de la base de données", "Données décrites en §2"],
                ["api.frankfurter.dev", "Taux de change (conversion EUR/GBP → USD)", "Aucune donnée personnelle — montant et devises uniquement"],
              ].map(([service, role, donnee]) => (
                <tr key={service} className="border-b border-border-soft last:border-0">
                  <td className="px-4 py-2.5 align-top text-foreground/90">{service}</td>
                  <td className="px-4 py-2.5 align-top text-foreground/90">{role}</td>
                  <td className="px-4 py-2.5 align-top text-foreground/90">{donnee}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Nous ne partageons vos données avec aucun autre tiers, et ne les vendons jamais.</p>
      </Section>

      <Section id="conservation" title="5. Conservation des données">
        <p>
          Vos données de compte et votre historique de recherche sont conservés tant que
          votre compte existe. La session locale (§2.4) est effacée dès que vous vous
          déconnectez ou désinstallez l&apos;extension.
        </p>
      </Section>

      <Section id="droits" title="6. Vos droits">
        <p>Vous pouvez à tout moment :</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            vous déconnecter depuis le panneau de l&apos;extension (efface immédiatement la
            session locale) ;
          </li>
          <li>
            demander l&apos;accès, la correction ou la suppression de vos données de compte en
            nous contactant à{" "}
            <a href="mailto:contact@cardquant.app" className="underline underline-offset-2 hover:text-foreground">
              contact@cardquant.app
            </a>
            . Nous n&apos;avons pas encore de suppression de compte en libre-service dans
            l&apos;interface — une demande par email est traitée manuellement.
          </li>
        </ul>
      </Section>

      <Section id="securite" title="7. Sécurité">
        <p>
          Les échanges avec nos serveurs se font en HTTPS. L&apos;accès à notre base de données
          est protégé par des identifiants dédiés et n&apos;est jamais exposé publiquement. Nous
          ne stockons aucun mot de passe (authentification déléguée à Firebase/Google).
        </p>
      </Section>

      <Section id="permissions" title="8. Permissions du navigateur">
        <p>
          L&apos;extension ne demande que les permissions strictement nécessaires à son
          fonctionnement : le stockage local (session, §2.4) et l&apos;accès réseau limité aux
          domaines eBay listés en §2.2, à notre API de verdict, aux services Firebase
          d&apos;authentification et au service de taux de change — jamais un accès générique à
          tous les sites que vous visitez.
        </p>
      </Section>

      <Section id="modifications" title="9. Modifications de cette politique">
        <p>
          Cette politique peut être mise à jour ; la date en haut de page reflète la dernière
          révision. Les changements substantiels seront signalés dans l&apos;extension ou sur le
          site.
        </p>
      </Section>

      <Section id="contact" title="10. Contact">
        <p>
          Pour toute question sur cette politique ou vos données :{" "}
          <a href="mailto:contact@cardquant.app" className="underline underline-offset-2 hover:text-foreground">
            contact@cardquant.app
          </a>
          .
        </p>
      </Section>
    </main>
  );
}
