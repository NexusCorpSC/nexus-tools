import type { Metadata } from "next";
import Link from "next/link";

import LegalPage, { type LegalSection } from "@/components/legal-page";

const UPDATED_AT = "2 août 2026";
const CONTACT_EMAIL = "tools@services.nexus";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description:
    "Quelles données Nexus Tools collecte, pourquoi, avec qui elles sont partagées, combien de temps elles sont conservées et comment exercer vos droits.",
  openGraph: {
    title: "Politique de confidentialité — Nexus Tools",
    description:
      "Les données collectées par Nexus Tools, leur usage et vos droits.",
    url: "https://tools.services.nexus/privacy",
  },
};

const sections: LegalSection[] = [
  {
    id: "principes",
    title: "En résumé",
    content: (
      <>
        <p>
          Nexus Tools est un projet communautaire bénévole. Le principe qui
          guide cette politique est simple&nbsp;:{" "}
          <strong>
            ne collecter que ce qui est nécessaire au fonctionnement des outils
          </strong>
          .
        </p>
        <ul>
          <li>
            Votre adresse de courriel ne sert qu&apos;à vous connecter. Aucun
            courriel promotionnel ne vous est envoyé.
          </li>
          <li>
            Vos données <strong>ne sont ni vendues, ni louées</strong>, et ne
            sont transmises à aucun annonceur.
          </li>
          <li>
            Aucun outil de mesure d&apos;audience ni de traçage publicitaire
            n&apos;est utilisé.
          </li>
          <li>
            Certaines fonctionnalités, comme la feuille de cargo, ne quittent
            jamais votre appareil.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "responsable",
    title: "Responsable du traitement",
    content: (
      <p>
        Les traitements décrits ci-dessous sont mis en œuvre par la{" "}
        <strong>Nexus Corporation</strong>, organisation communautaire
        francophone de joueurs de Star Citizen, éditrice de Nexus Tools et de
        Nexus App. Toute demande relative à vos données peut être adressée à{" "}
        <Link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Link>.
      </p>
    ),
  },
  {
    id: "donnees",
    title: "Données collectées",
    content: (
      <>
        <p>
          <strong>Données de compte</strong>{" "}— renseignées à l&apos;inscription
          ou générées par le Service&nbsp;:
        </p>
        <ul>
          <li>votre adresse de courriel&nbsp;;</li>
          <li>
            un pseudonyme (généré automatiquement, modifiable) et un identifiant
            de compte&nbsp;;
          </li>
          <li>un avatar, si vous en téléversez un&nbsp;;</li>
          <li>
            selon votre méthode de connexion&nbsp;: la clé publique de votre clé
            d&apos;accès (passkey), ou l&apos;identifiant de votre compte
            Discord si vous choisissez de le lier.
          </li>
        </ul>
        <p>
          <strong>Contenus que vous créez</strong>{" "}— uniquement ceux que vous
          saisissez&nbsp;: inventaire et lieux de stockage, réputations par
          faction, plans possédés, travaux de raffinage, notes du bloc-notes,
          appartenance à des organisations et escouades, boutiques, articles mis
          en vente, commandes et devis échangés.
        </p>
        <p>
          <strong>Données techniques</strong>{" "}— un cookie de session, un cookie
          de langue, et les journaux serveur générés par l&apos;hébergeur
          (adresse IP, date, page appelée, agent utilisateur) nécessaires au
          fonctionnement et à la sécurité du Service.
        </p>
      </>
    ),
  },
  {
    id: "finalites",
    title: "Finalités et bases légales",
    content: (
      <ul>
        <li>
          <strong>Fournir le Service</strong>{" "}(compte, outils, marketplace, API,
          application de bureau) — exécution des conditions d&apos;utilisation
          acceptées lors de votre inscription.
        </li>
        <li>
          <strong>Sécuriser le Service</strong>{" "}(prévention des abus,
          journalisation technique, limitation des requêtes) — intérêt légitime
          de l&apos;éditeur à maintenir un service disponible et sûr.
        </li>
        <li>
          <strong>Vous authentifier</strong>{" "}(envoi de codes à usage unique par
          courriel, clés d&apos;accès, connexion Discord) — exécution du Service
          à votre demande.
        </li>
        <li>
          <strong>Répondre à vos demandes</strong>{" "}adressées par courriel —
          intérêt légitime à traiter les sollicitations reçues.
        </li>
      </ul>
    ),
  },
  {
    id: "local",
    title: "Ce qui ne quitte pas votre appareil",
    content: (
      <>
        <p>
          Certaines fonctionnalités sont volontairement conçues pour rester
          locales&nbsp;:
        </p>
        <ul>
          <li>
            la <strong>feuille de cargo</strong>{" "}est enregistrée dans le
            stockage de votre navigateur (ou de l&apos;application de bureau) et
            n&apos;est jamais envoyée au serveur&nbsp;;
          </li>
          <li>
            la <strong>lecture des captures d&apos;écran</strong>{" "}du journal de
            mission est effectuée sur votre machine&nbsp;: l&apos;image et le
            texte reconnu ne sont pas transmis&nbsp;;
          </li>
          <li>
            dans Nexus App, le <strong>bloc-notes hors connexion</strong>{" "}reste
            stocké localement tant que vous n&apos;êtes pas connecté.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "visibilite",
    title: "Ce que voient les autres joueurs",
    content: (
      <>
        <p>
          Une partie de vos informations est visible par d&apos;autres
          utilisateurs, parce que c&apos;est l&apos;objet même de l&apos;outil.
          Votre{" "}
          <strong>adresse de courriel n&apos;en fait jamais partie</strong>.
        </p>
        <ul>
          <li>
            votre <strong>pseudonyme et votre avatar</strong>{" "}apparaissent sur
            vos annonces, vos commandes et dans les organisations dont vous êtes
            membre&nbsp;;
          </li>
          <li>
            les membres de votre organisation voient les{" "}
            <strong>réputations, plans et objets d&apos;inventaire</strong>{" "}que
            vous avez choisi de partager&nbsp;;
          </li>
          <li>
            une boutique voit le contenu des <strong>commandes</strong>{" "}que vous
            lui adressez&nbsp;;
          </li>
          <li>
            vos <strong>notes</strong>{" "}et votre inventaire non partagé ne sont
            visibles que par vous.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "sous-traitants",
    title: "Prestataires techniques",
    content: (
      <>
        <p>
          Le Service s&apos;appuie sur des prestataires qui agissent pour son
          compte et n&apos;utilisent pas vos données à d&apos;autres fins&nbsp;:
        </p>
        <ul>
          <li>
            <strong>Vercel</strong>{" "}— hébergement du site et stockage des images
            téléversées&nbsp;;
          </li>
          <li>
            <strong>MongoDB</strong>{" "}— base de données du Service&nbsp;;
          </li>
          <li>
            <strong>Resend</strong>{" "}— envoi des courriels de connexion&nbsp;;
          </li>
          <li>
            <strong>Discord</strong>{" "}— uniquement si vous utilisez la connexion
            Discord ou les intégrations Discord&nbsp;;
          </li>
          <li>
            <strong>GitHub</strong>{" "}— distribution des mises à jour de Nexus
            App.
          </li>
        </ul>
        <p>
          Certains de ces prestataires peuvent héberger des données en dehors de
          l&apos;Union européenne&nbsp;; les transferts sont alors encadrés par
          les garanties prévues par leurs conditions contractuelles. Cette liste
          est susceptible d&apos;évoluer avec le Service.
        </p>
        <p>
          Aucune donnée n&apos;est cédée, vendue ou louée à des tiers à des fins
          commerciales ou publicitaires.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    content: (
      <>
        <p>
          Le Service utilise uniquement des cookies{" "}
          <strong>strictement nécessaires</strong>{" "}à son fonctionnement&nbsp;:
        </p>
        <ul>
          <li>
            un <strong>cookie de session</strong>, qui vous maintient
            connecté&nbsp;;
          </li>
          <li>
            un <strong>cookie de langue</strong>, qui retient si vous préférez
            le français ou l&apos;anglais.
          </li>
        </ul>
        <p>
          Aucun cookie publicitaire, de mesure d&apos;audience ou de traçage
          tiers n&apos;est déposé&nbsp;: aucune bannière de consentement
          n&apos;est donc nécessaire.
        </p>
      </>
    ),
  },
  {
    id: "conservation",
    title: "Durée de conservation",
    content: (
      <ul>
        <li>
          <strong>Compte et contenus associés</strong>&nbsp;: conservés tant que
          le compte existe, puis supprimés lorsque vous en faites la demande.
        </li>
        <li>
          <strong>Codes de connexion à usage unique</strong>&nbsp;: valables
          quelques minutes, puis invalidés.
        </li>
        <li>
          <strong>Sessions</strong>&nbsp;: expirent automatiquement, et
          immédiatement en cas de déconnexion.
        </li>
        <li>
          <strong>Journaux techniques</strong>&nbsp;: conservés par
          l&apos;hébergeur pour une durée courte, à des fins de sécurité et de
          diagnostic.
        </li>
        <li>
          <strong>Contenus publiés</strong>{" "}(annonces, commandes)&nbsp;:
          conservés tant qu&apos;ils sont utiles au suivi des échanges, ou
          jusqu&apos;à leur suppression.
        </li>
      </ul>
    ),
  },
  {
    id: "securite",
    title: "Sécurité",
    content: (
      <p>
        Les échanges avec le Service sont chiffrés (HTTPS). L&apos;accès aux
        données est limité aux membres de l&apos;équipe qui en ont besoin pour
        maintenir le Service. La connexion se fait sans mot de passe&nbsp;: par
        code à usage unique, clé d&apos;accès ou Discord, ce qui évite de
        stocker un secret réutilisable. Aucun système n&apos;étant infaillible,
        nous vous invitons à ne pas confier au Service d&apos;informations
        sensibles sans rapport avec le jeu.
      </p>
    ),
  },
  {
    id: "droits",
    title: "Vos droits",
    content: (
      <>
        <p>
          Conformément au Règlement général sur la protection des données
          (RGPD), vous disposez d&apos;un droit d&apos;
          <strong>accès</strong>, de <strong>rectification</strong>, d&apos;
          <strong>effacement</strong>, de <strong>portabilité</strong>, de{" "}
          <strong>limitation</strong>{" "}et d&apos;
          <strong>opposition</strong>{" "}au traitement de vos données.
        </p>
        <p>
          Une partie de ces droits s&apos;exerce directement depuis le
          Service&nbsp;: votre profil vous permet de modifier votre pseudonyme
          et votre avatar, et chaque outil vous permet de supprimer les contenus
          que vous y avez créés.
        </p>
        <p>
          Pour toute autre demande, écrivez à{" "}
          <Link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Link>{" "}depuis
          l&apos;adresse associée à votre compte. Vous disposez également du
          droit d&apos;introduire une réclamation auprès de la{" "}
          <Link href="https://www.cnil.fr">CNIL</Link>.
        </p>
      </>
    ),
  },
  {
    id: "mineurs",
    title: "Mineurs",
    content: (
      <p>
        Le Service n&apos;est pas destiné aux enfants de moins de 15 ans. Si
        vous constatez qu&apos;un compte a été créé par un enfant de moins de 15
        ans sans l&apos;accord de ses représentants légaux, signalez-le à{" "}
        <Link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Link>&nbsp;: le
        compte et les données associées seront supprimés.
      </p>
    ),
  },
  {
    id: "modification",
    title: "Modification de cette politique",
    content: (
      <p>
        Cette politique peut évoluer avec le Service. La date de dernière mise à
        jour figure en tête de page. En cas de changement substantiel dans les
        données collectées ou leur usage, l&apos;information sera portée sur le
        Service.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: (
      <p>
        Pour toute question relative à vos données&nbsp;:{" "}
        <Link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Link>. Voir
        également les{" "}
        <Link href="/cgu">conditions générales d&apos;utilisation</Link>.
      </p>
    ),
  },
];

export default function Page() {
  return (
    <LegalPage
      eyebrow="Informations légales"
      title="Politique de confidentialité"
      intro="Quelles données Nexus Tools collecte, pourquoi, qui peut les voir, combien de temps elles sont conservées — et comment reprendre la main dessus."
      updatedAt={UPDATED_AT}
      sections={sections}
    />
  );
}
