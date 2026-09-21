/**
 * The French for the surface a reader meets first: the home page, every
 * page's title and hero, the partner descriptions and the collection names.
 *
 * Scope, and why it stops where it does
 * -------------------------------------
 * Only scalar fields are translated here. A page's `sections` — the About Us
 * blocks, the Our History timeline — are arrays, and the API replaces an
 * array wholesale rather than merging it, so translating one would mean
 * freezing a full French copy of a block that is still being edited in
 * English. Those are better done from the Français panel in the editor, once
 * their wording has settled.
 *
 * The long-form content — the programme narratives and the staff biographies
 * — is deliberately not here. It is specialist policy wording and real
 * people's histories, and belongs to T-TEL to write or review rather than to
 * be guessed at.
 *
 * Nothing here overwrites a translation that already exists, so a phrase
 * corrected in the admin survives a re-run.
 *
 *   node scripts/seedFrench.js
 */
import { connectDb, disconnectDb } from "../src/config/db.js";
import { Page } from "../src/models/Page.js";
import { Partner } from "../src/models/Partner.js";
import { DocumentCategory } from "../src/models/Document.js";
import { Setting } from "../src/models/Setting.js";

/** Home page and shell wording. Keys not listed keep their English. */
const SETTINGS = {
  site_tagline: "Transformer l’enseignement, l’éducation et l’apprentissage",
  blog_label: "Actualités et médias",
  cta_label: "Nous contacter",
  footer_links_heading: "À propos",
  footer_links_2_heading: "Liens utiles",
  hero_heading:
    "Nous accompagnons le gouvernement dans le renforcement du système éducatif ghanéen pour qu’il atteigne de nouveaux sommets",
  home_who_heading: "Qui sommes-nous",
  home_who_body:
    "T-TEL est une organisation ghanéenne à but non lucratif qui fournit des conseils techniques de haute qualité, de la gestion de projet, de la recherche et des services d’appui à la mise en œuvre, en mobilisant les talents et l’expertise du pays pour améliorer les résultats d’apprentissage et renforcer la performance du système éducatif ghanéen.",
  home_who_button_label: "En savoir plus",
  home_who_image_alt: "L’équipe de T-TEL",
  home_strategic_heading: "Objectifs stratégiques",
  home_strategic_card1:
    "Accompagner le gouvernement du Ghana dans la traduction des politiques et priorités éducatives nationales — dont le Plan stratégique pour l’éducation (ESP) 2018-2030 et les recommandations du Comité du Forum national sur l’éducation — en réformes cohérentes, applicables et mesurables.",
  home_strategic_card2:
    "Ancrer les données probantes, l’apprentissage et une mise en œuvre adaptative au sein des institutions éducatives ghanéennes, afin que les réformes se poursuivent au-delà des programmes et que les enseignements tirés soient partagés à travers l’Afrique.",
  home_strategic_card3:
    "Renforcer la capacité institutionnelle de T-TEL par un leadership solide, une bonne gouvernance et une résilience financière.",
  home_articles_heading: "Nos articles",
  home_focus_heading: "Domaines d’intervention",
  home_focus_intro:
    "Notre travail vise à transformer l’éducation au service du développement, en collaboration avec le ministère de l’Éducation et ses agences.",
  home_funders_heading: "Bailleurs de fonds",
  contact_hours: "Lundi – Vendredi\n8h00 – 17h00 GMT",
};

/** Page titles and hero wording, by slug. */
const PAGES = {
  home: { title: "Accueil" },
  "about-us": {
    title: "Qui sommes-nous",
    meta: { heroTitle: "Qui sommes-nous" },
  },
  "about-us/our-history": { title: "Notre histoire" },
  "about-us/our-people": {
    title: "Notre équipe",
    meta: { heroTitle: "Notre équipe" },
  },
  "about-us/our-partners": { title: "Nos partenaires" },
  "about-us/our-policies": {
    title: "Nos politiques",
    meta: { heroTitle: "Nos politiques" },
  },
  "focus-areas": { title: "Domaines d’intervention" },
  programmes: {
    title: "Programmes",
    meta: {
      heroTitle: "Programmes",
      heroDescription:
        "Les projets par lesquels T-TEL apporte conseil technique, gestion de projet, recherche et appui à la mise en œuvre à travers le Ghana.",
    },
  },
  "knowledge-hub": {
    title: "Centre de ressources",
    meta: {
      heroTitle: "Centre de ressources",
      heroDescription:
        "Recherches, ressources pédagogiques, rapports d’évaluation et publications issus d’une décennie de réforme éducative au Ghana.",
    },
  },
  "news-and-media": { title: "Actualités et médias" },
  "join-us": {
    title: "Nous rejoindre",
    meta: {
      heroTitle: "Rejoignez notre équipe",
      heroDescription:
        "Construisez votre carrière au sein d’une organisation ghanéenne qui transforme l’enseignement, l’éducation et l’apprentissage.",
    },
  },
  "contact-us": {
    title: "Nous contacter",
    meta: {
      heroTitle: "Nous contacter",
      heroDescription:
        "Des questions ou des demandes ? Joignez-nous à l’aide des coordonnées ci-dessous ou remplissez le formulaire.",
    },
  },
};

/** Document collections, by slug. */
const COLLECTIONS = {
  "basic-education": "Éducation de base",
  "secondary-education": "Enseignement secondaire",
  "teacher-education": "Formation des enseignants",
  "reports-and-publications": "Rapports et publications de T-TEL",
  policies: "Politiques",
  "bed-resources": "Ressources B.Ed.",
  "impact-learning-and-good-practice": "Impact, apprentissage et bonnes pratiques",
  "college-leadership-and-management": "Direction et gestion des collèges",
  "teacher-education-policy-and-institutional-development":
    "Politique de formation des enseignants et développement institutionnel",
  tvet: "EFTP",
};

/**
 * Partner descriptions, by slug. The names themselves stay in English: they
 * are the registered names of real institutions, and a partner's own name is
 * not ours to translate.
 */
const PARTNERS = {
  "ministry-of-education":
    "Le ministère de l’Éducation a pour mandat d’offrir une éducation pertinente à l’ensemble des Ghanéens et assume la responsabilité de toutes les politiques éducatives, y compris l’apprentissage et l’acquisition de compétences au sens large.",
  "ghana-tertiary-education-commission-gtec":
    "GTEC est l’agence du gouvernement du Ghana chargée de superviser et d’assurer la qualité de l’ensemble des établissements et programmes d’enseignement supérieur. GTEC est l’agence chef de file pour toutes les activités liées à la formation des enseignants.",
  "kwame-nkrumah-university-of-science-and-technology":
    "L’Université des sciences et technologies Kwame Nkrumah (KNUST) est l’une des cinq universités publiques désignées par GTEC pour superviser la mise en œuvre de la licence en éducation (B.Ed.) sur quatre ans, en collaboration avec ses collèges d’éducation affiliés.",
  "university-for-development-studies":
    "L’Université d’études pour le développement (UDS) est l’une des cinq universités publiques désignées par GTEC pour superviser la mise en œuvre de la licence en éducation (B.Ed.) sur quatre ans, en collaboration avec ses six collèges d’éducation affiliés.",
  "university-of-education-winneba":
    "L’Université de l’éducation de Winneba (UEW) est l’une des cinq universités publiques désignées par GTEC pour superviser la mise en œuvre de la licence en éducation (B.Ed.) sur quatre ans, en collaboration avec ses quinze collèges d’éducation affiliés.",
  "university-of-cape-coast":
    "L’Université de Cape Coast (UCC) est l’une des cinq universités publiques désignées par GTEC pour superviser la mise en œuvre de la licence en éducation (B.Ed.) sur quatre ans, en collaboration avec ses quatorze collèges d’éducation affiliés.",
  "university-of-ghana":
    "L’Université du Ghana (UoG) est l’une des cinq universités publiques désignées par GTEC pour superviser la mise en œuvre de la licence en éducation (B.Ed.) sur quatre ans, en collaboration avec ses six collèges d’éducation affiliés.",
  "mastercard-foundation":
    "La Mastercard Foundation œuvre pour un monde où chacun a la possibilité d’apprendre et de prospérer. Son action est guidée par sa mission de promouvoir l’apprentissage et l’inclusion financière.",
  "jacobs-foundation":
    "La Jacobs Foundation est une fondation caritative qui investit dans l’avenir des jeunes afin de leur offrir de meilleures perspectives de développement et un accès équitable à l’éducation, pour qu’ils deviennent des membres responsables de la société.",
  edtechhub:
    "EdTech Hub est un partenariat de recherche international à but non lucratif. Son objectif est de donner à chacun les données probantes nécessaires pour décider de la place des technologies dans l’éducation.",
  "university-of-oxford":
    "La Blavatnik School of Government de l’Université d’Oxford, avec le soutien du Foreign, Commonwealth and Development Office (FCDO) et de l’Education Commission, a travaillé avec T-TEL pour produire des données probantes.",
};

/** Builds translations[lang], never replacing a value already written there. */
function mergeTranslation(doc, lang, patch) {
  const existing = doc.translations?.[lang] || {};
  const next = { ...existing };
  let added = 0;

  for (const [field, value] of Object.entries(patch)) {
    if (value === null || value === undefined) continue;

    if (field === "meta") {
      const meta = { ...(existing.meta || {}) };
      for (const [key, inner] of Object.entries(value)) {
        if (meta[key] === undefined || meta[key] === "") {
          meta[key] = inner;
          added++;
        }
      }
      next.meta = meta;
      continue;
    }

    if (existing[field] === undefined || existing[field] === "") {
      next[field] = value;
      added++;
    }
  }
  return { next, added };
}

async function translateAll(Model, table, toPatch, label) {
  let count = 0;
  for (const [slug, value] of Object.entries(table)) {
    const doc = await Model.findOne({ slug });
    if (!doc) {
      console.log(`  no ${label} "${slug}"`);
      continue;
    }
    const { next, added } = mergeTranslation(doc, "fr", toPatch(value));
    if (!added) continue;
    await Model.updateOne({ _id: doc._id }, { $set: { "translations.fr": next } });
    count++;
  }
  console.log(`${label}: ${count} translated`);
}

async function main() {
  await connectDb();

  let settings = 0;
  for (const [key, value] of Object.entries(SETTINGS)) {
    const row = await Setting.findOne({ key });
    if (!row) {
      console.log(`  no setting "${key}"`);
      continue;
    }
    if (row.translations?.fr) continue;
    await Setting.updateOne({ key }, { $set: { "translations.fr": value } });
    settings++;
  }
  console.log(`settings: ${settings} translated`);

  await translateAll(Page, PAGES, (v) => v, "pages");
  await translateAll(DocumentCategory, COLLECTIONS, (name) => ({ name }), "collections");
  await translateAll(Partner, PARTNERS, (description) => ({ description }), "partners");

  console.log("\ndone");
  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});
