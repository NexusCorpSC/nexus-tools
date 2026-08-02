import type { Metadata } from "next";
import Link from "next/link";

import LegalPage, { type LegalSection } from "@/components/legal-page";

const UPDATED_AT = "2 août 2026";
const CONTACT_EMAIL = "tools@services.nexus";

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation",
  description:
    "Conditions générales d'utilisation de Nexus Tools : accès au service, compte utilisateur, règles de publication, marketplace, propriété intellectuelle et responsabilités.",
  openGraph: {
    title: "Conditions générales d'utilisation — Nexus Tools",
    description:
      "Les règles d'utilisation de Nexus Tools, la boîte à outils communautaire Star Citizen.",
    url: "https://tools.services.nexus/cgu",
  },
};

const sections: LegalSection[] = [
  {
    id: "objet",
    title: "Objet et acceptation",
    content: (
      <>
        <p>
          Les présentes conditions générales d&apos;utilisation (les
          «&nbsp;CGU&nbsp;») encadrent l&apos;accès et l&apos;utilisation du
          site <strong>Nexus Tools</strong>, accessible à l&apos;adresse{" "}
          <em>tools.services.nexus</em>, de son API publique et de
          l&apos;application de bureau <strong>Nexus App</strong>{" "}(ensemble, le
          «&nbsp;Service&nbsp;»).
        </p>
        <p>
          En accédant au Service, en y créant un compte ou en utilisant
          l&apos;API, vous acceptez les présentes CGU sans réserve. Si vous ne
          les acceptez pas, il vous appartient de ne pas utiliser le Service.
        </p>
      </>
    ),
  },
  {
    id: "editeur",
    title: "Éditeur du service",
    content: (
      <>
        <p>
          Le Service est édité et maintenu par les membres de la{" "}
          <strong>Nexus Corporation</strong>, organisation communautaire
          francophone de joueurs de Star Citizen. Il s&apos;agit d&apos;un
          projet <strong>bénévole et non commercial</strong>.
        </p>
        <p>
          Toute question relative aux présentes CGU peut être adressée à{" "}
          <Link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Link>.
        </p>
      </>
    ),
  },
  {
    id: "description",
    title: "Description du service",
    content: (
      <>
        <p>
          Nexus Tools met à disposition des joueurs un ensemble d&apos;outils
          d&apos;organisation liés au jeu Star Citizen, notamment&nbsp;:
        </p>
        <ul>
          <li>
            une <strong>marketplace</strong>{" "}permettant de proposer des biens et
            services en jeu, ainsi qu&apos;un suivi des commandes et des devis
            entre joueurs&nbsp;;
          </li>
          <li>
            des outils d&apos;<strong>artisanat</strong>{" "}(plans, recettes,
            possession au sein d&apos;une organisation)&nbsp;;
          </li>
          <li>
            un <strong>inventaire</strong> personnel et partagé, une{" "}
            <strong>feuille de cargo</strong> et un suivi des travaux de{" "}
            <strong>raffinage</strong>&nbsp;;
          </li>
          <li>
            un catalogue de <strong>missions</strong> et de{" "}
            <strong>factions</strong>, ainsi qu&apos;un suivi des{" "}
            <strong>réputations</strong>&nbsp;;
          </li>
          <li>
            des <strong>organisations</strong>, un <strong>bloc-notes</strong>{" "}
            en ligne, une <strong>API REST</strong> publique et un serveur{" "}
            <strong>MCP</strong>&nbsp;;
          </li>
          <li>
            l&apos;application de bureau <strong>Nexus App</strong>, qui
            consomme cette même API.
          </li>
        </ul>
        <p>
          Le Service est fourni <strong>gratuitement</strong>. Son périmètre
          évolue au fil du développement&nbsp;: des fonctionnalités peuvent être
          ajoutées, modifiées ou retirées.
        </p>
      </>
    ),
  },
  {
    id: "compte",
    title: "Compte utilisateur",
    content: (
      <>
        <p>
          Certaines fonctionnalités sont accessibles sans compte&nbsp;; les
          autres nécessitent la création d&apos;un compte, par code à usage
          unique envoyé par courriel, par clé d&apos;accès (passkey) ou via
          Discord.
        </p>
        <ul>
          <li>
            Vous êtes responsable de la confidentialité de vos moyens de
            connexion et des actions réalisées depuis votre compte.
          </li>
          <li>
            Vous vous engagez à fournir une adresse de courriel valide et à ne
            pas usurper l&apos;identité d&apos;un tiers.
          </li>
          <li>
            Un compte est personnel. Le partage d&apos;un compte entre plusieurs
            personnes n&apos;est pas autorisé.
          </li>
          <li>
            Vous pouvez demander la suppression de votre compte à tout moment en
            écrivant à{" "}
            <Link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Link>.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "beta",
    title: "Accès bêta et disponibilité",
    content: (
      <>
        <p>
          Le Service est en cours de développement. Certaines fonctionnalités,
          notamment la <strong>création d&apos;organisations</strong> et la{" "}
          <strong>vente sur la marketplace</strong>, sont réservées à des
          comptes disposant d&apos;un accès attribué par la Nexus Corporation.
        </p>
        <p>
          Le Service est fourni «&nbsp;en l&apos;état&nbsp;» et{" "}
          <strong>sans garantie de disponibilité</strong>. Des interruptions,
          des pertes de données ou des remises à zéro peuvent survenir,
          notamment lors des phases de développement. Il vous appartient de
          conserver une copie des informations qui vous sont importantes.
        </p>
      </>
    ),
  },
  {
    id: "usage",
    title: "Règles d'utilisation",
    content: (
      <>
        <p>En utilisant le Service, vous vous engagez à ne pas&nbsp;:</p>
        <ul>
          <li>
            publier de contenu illicite, haineux, diffamatoire, harcelant,
            pornographique ou contraire aux droits des tiers&nbsp;;
          </li>
          <li>
            usurper l&apos;identité d&apos;un joueur, d&apos;une organisation ou
            de la Nexus Corporation&nbsp;;
          </li>
          <li>
            perturber le fonctionnement du Service&nbsp;: tentative
            d&apos;intrusion, contournement des contrôles d&apos;accès,
            injection de contenu, envoi massif de requêtes&nbsp;;
          </li>
          <li>
            extraire massivement les données du Service par des moyens
            automatisés en dehors de l&apos;API prévue à cet effet&nbsp;;
          </li>
          <li>
            utiliser le Service pour proposer des échanges contre de{" "}
            <strong>l&apos;argent réel</strong>, vendre des comptes de jeu, ou
            toute pratique contraire aux conditions d&apos;utilisation de Star
            Citizen.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "contenus",
    title: "Contenus publiés par les utilisateurs",
    content: (
      <>
        <p>
          Vous restez responsable des contenus que vous publiez&nbsp;: annonces,
          descriptions de boutique, messages de commande, noms
          d&apos;organisation, notes, images téléversées.
        </p>
        <p>
          Vous garantissez disposer des droits nécessaires sur les contenus que
          vous publiez et accordez à la Nexus Corporation le droit non exclusif
          de les héberger et de les afficher dans le Service, aux seules fins de
          son fonctionnement.
        </p>
        <p>
          Tout contenu contraire aux présentes CGU peut être{" "}
          <strong>retiré sans préavis</strong>. Un contenu manifestement
          illicite peut être signalé à{" "}
          <Link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Link>.
        </p>
      </>
    ),
  },
  {
    id: "marketplace",
    title: "Marketplace, commandes et devis",
    content: (
      <>
        <p>
          La marketplace de Nexus Tools est un{" "}
          <strong>outil de mise en relation entre joueurs</strong>. Les échanges
          portent exclusivement sur des biens et services{" "}
          <strong>virtuels au sein du jeu</strong>, réglés en monnaie du jeu
          (aUEC).
        </p>
        <ul>
          <li>
            Aucun paiement en argent réel n&apos;est traité par le Service, et
            aucun n&apos;est autorisé.
          </li>
          <li>
            La Nexus Corporation <strong>n&apos;est pas partie</strong>{" "}aux
            transactions conclues entre joueurs&nbsp;: elle n&apos;intervient ni
            dans la livraison, ni dans le paiement, ni dans le règlement des
            litiges entre acheteur et vendeur.
          </li>
          <li>
            Les devis, prix et stocks affichés sont renseignés par les vendeurs
            et n&apos;engagent qu&apos;eux.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "propriete",
    title: "Propriété intellectuelle",
    content: (
      <>
        <p>
          Nexus Tools est un projet <strong>communautaire non officiel</strong>.
          Il n&apos;est ni affilié, ni associé, ni approuvé par{" "}
          <strong>Cloud Imperium Games</strong> ou{" "}
          <strong>Roberts Space Industries</strong>.
        </p>
        <p>
          Star Citizen®, Squadron 42®, Roberts Space Industries® et Cloud
          Imperium® sont des marques déposées de Cloud Imperium Rights LLC. Les
          images, noms et données du jeu restent la propriété de leurs
          détenteurs respectifs et sont utilisés dans le cadre d&apos;un usage
          communautaire non commercial.
        </p>
        <p>
          Le code source du Service et de Nexus App est publié sur{" "}
          <Link href="https://github.com/NexusCorpSC">GitHub</Link>{" "}et régi par
          les licences qui y figurent.
        </p>
      </>
    ),
  },
  {
    id: "api",
    title: "API, MCP et application de bureau",
    content: (
      <>
        <p>
          L&apos;API REST et le serveur MCP sont mis à disposition pour
          permettre à des applications tierces d&apos;utiliser les données de
          Nexus Tools. Leur usage suppose&nbsp;:
        </p>
        <ul>
          <li>
            un <strong>usage raisonnable</strong>&nbsp;: pas de charge
            disproportionnée, pas de contournement des limitations mises en
            place&nbsp;;
          </li>
          <li>
            le respect de la <strong>visibilité des données</strong>&nbsp;: une
            application tierce ne doit pas exposer des données qu&apos;un
            utilisateur ne verrait pas depuis le site&nbsp;;
          </li>
          <li>
            l&apos;absence de confusion&nbsp;: une application tierce ne doit
            pas se présenter comme étant éditée par la Nexus Corporation.
          </li>
        </ul>
        <p>
          Les routes de l&apos;API peuvent évoluer sans préavis tant que le
          Service est en développement. Nexus App n&apos;installe aucune mise à
          jour sans action de votre part.
        </p>
      </>
    ),
  },
  {
    id: "donnees",
    title: "Données personnelles",
    content: (
      <>
        <p>
          Le traitement de vos données personnelles est décrit dans la{" "}
          <Link href="/privacy">politique de confidentialité</Link>, qui fait
          partie intégrante des présentes CGU.
        </p>
      </>
    ),
  },
  {
    id: "responsabilite",
    title: "Responsabilité",
    content: (
      <>
        <p>
          Le Service est fourni gratuitement, en l&apos;état, sans garantie
          d&apos;aucune sorte. La Nexus Corporation et les contributeurs du
          projet ne sauraient être tenus responsables&nbsp;:
        </p>
        <ul>
          <li>
            d&apos;une indisponibilité, d&apos;une perte de données ou
            d&apos;une erreur dans les informations affichées (les données de
            jeu évoluent à chaque patch)&nbsp;;
          </li>
          <li>
            des conséquences d&apos;une transaction conclue entre joueurs via la
            marketplace&nbsp;;
          </li>
          <li>
            des contenus publiés par les utilisateurs ou du comportement de
            ceux-ci&nbsp;;
          </li>
          <li>
            de l&apos;usage fait du Service en contradiction avec les présentes
            CGU.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "suspension",
    title: "Suspension et résiliation",
    content: (
      <>
        <p>
          En cas de manquement aux présentes CGU, l&apos;accès à tout ou partie
          du Service peut être suspendu ou supprimé, si nécessaire sans préavis.
        </p>
        <p>
          Vous pouvez cesser d&apos;utiliser le Service à tout moment et
          demander la suppression de votre compte et des données associées.
        </p>
      </>
    ),
  },
  {
    id: "modification",
    title: "Modification des CGU",
    content: (
      <p>
        Les présentes CGU peuvent être modifiées pour suivre l&apos;évolution du
        Service ou de la réglementation. La date de dernière mise à jour figure
        en tête de page&nbsp;; l&apos;utilisation du Service après cette date
        vaut acceptation de la version en vigueur.
      </p>
    ),
  },
  {
    id: "droit",
    title: "Droit applicable",
    content: (
      <p>
        Les présentes CGU sont soumises au <strong>droit français</strong>. À
        défaut de résolution amiable, tout litige relatif à leur interprétation
        ou à leur exécution relève des juridictions compétentes.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: (
      <p>
        Pour toute question, signalement ou demande relative au Service&nbsp;:{" "}
        <Link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Link>.
      </p>
    ),
  },
];

export default function Page() {
  return (
    <LegalPage
      eyebrow="Informations légales"
      title="Conditions générales d'utilisation"
      intro="Les règles qui encadrent l'utilisation de Nexus Tools, de son API et de l'application de bureau Nexus App."
      updatedAt={UPDATED_AT}
      sections={sections}
    />
  );
}
