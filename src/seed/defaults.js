// Default structure and settings. Mirrors the live system's keys and labels so
// the client finds everything where they expect it.

export const CONTENT_TYPES = [
  { name: "Blog", slug: "blog", description: "News, features and updates.", isSystem: true, icon: "newspaper" },
  { name: "Focus Areas", slug: "focus-areas", description: "The pillars T-TEL's technical assistance works through.", isSystem: true, icon: "target" },
  { name: "Programmes", slug: "programmes", description: "Funded projects T-TEL delivers.", isSystem: true, icon: "briefcase" },
];

export const PERSON_GROUPS = [
  { name: "Subscribers", slug: "subscribers", sortOrder: 1, description: "The founding members of T-TEL." },
  { name: "Board of Directors", slug: "board-of-directors", sortOrder: 2, description: "Governance oversight and accountability." },
  { name: "Key Advisors", slug: "key-advisors", sortOrder: 3, description: "Senior specialists guiding our technical work." },
  { name: "Senior Management", slug: "senior-management", sortOrder: 4, description: "The leadership team." },
  { name: "Technical Pool", slug: "technical-pool", sortOrder: 5, description: "Regional leads, coordinators and advisors." },
  { name: "Finance & Operations", slug: "finance-and-operations", sortOrder: 6, description: "Finance, procurement, logistics and support." },
];

/**
 * Knowledge Hub structure, matching the live site's menu: Teacher Education
 * is a parent holding four sub-collections, then three top-level siblings.
 * `policies` is kept for the Our Policies page, which is fed separately.
 */
export const DOCUMENT_COLLECTION_TREE = [
  {
    name: "Teacher Education",
    slug: "teacher-education",
    sortOrder: 1,
    children: [
      { name: "B.Ed. Resources", slug: "bed-resources", sortOrder: 1 },
      { name: "Impact, Learning & Good Practice", slug: "impact-learning-and-good-practice", sortOrder: 2 },
      { name: "College Leadership & Management", slug: "college-leadership-and-management", sortOrder: 3 },
      { name: "Teacher Education Policy & Institutional Development", slug: "teacher-education-policy-and-institutional-development", sortOrder: 4 },
    ],
  },
  { name: "Basic Education", slug: "basic-education", sortOrder: 2 },
  { name: "Secondary Education", slug: "secondary-education", sortOrder: 3 },
  { name: "T-TEL Reports & Publications", slug: "reports-and-publications", sortOrder: 4 },
  { name: "Policies", slug: "policies", sortOrder: 5 },
];

export const DOCUMENT_COLLECTIONS = [
  { name: "Basic Education", slug: "basic-education", sortOrder: 1 },
  { name: "Secondary Education", slug: "secondary-education", sortOrder: 2 },
  { name: "TVET", slug: "tvet", sortOrder: 3 },
  { name: "Teacher Education", slug: "teacher-education", sortOrder: 4 },
  { name: "T-TEL Reports & Publications", slug: "reports-and-publications", sortOrder: 5 },
  { name: "Policies", slug: "policies", sortOrder: 6 },
];

export const MENUS = [
  { name: "Main Navigation", slug: "main", location: "header" },
  { name: "About Us", slug: "about-us", location: "footer" },
  { name: "Useful Links", slug: "footer-ii", location: "footer" },
];

export const MAIN_MENU_ITEMS = [
  { key: "about", label: "About Us", url: "/about-us", children: [
    { key: "history", label: "Our History", url: "/about-us/our-history" },
    { key: "who", label: "Who We Are", url: "/about-us" },
    { key: "people", label: "Our People", url: "/about-us/our-people" },
    { key: "partners", label: "Our Partners", url: "/about-us/our-partners" },
    { key: "policies", label: "Our Policies", url: "/about-us/our-policies" },
    { key: "join", label: "Join Us", url: "/join-us" },
  ]},
  { key: "focus", label: "Focus Areas", url: "/focus-areas" },
  { key: "programmes", label: "Programmes", url: "/programmes" },
  { key: "knowledge", label: "Knowledge Hub", url: "/knowledge-hub" },
  { key: "news", label: "News & Media", url: "/news-and-media" },
  { key: "contact", label: "Contact Us", url: "/contact-us" },
];

export const FOOTER_ABOUT_ITEMS = [
  { key: "f1", label: "Who We Are", url: "/about-us" },
  { key: "f2", label: "Our History", url: "/about-us/our-history" },
  { key: "f3", label: "Our Partners", url: "/about-us/our-partners" },
];

export const FOOTER_LINKS_ITEMS = [
  { key: "g1", label: "Join Us", url: "/join-us" },
  { key: "g2", label: "Our Policies", url: "/about-us/our-policies" },
  { key: "g3", label: "T-TEL Reports & Publications", url: "/knowledge-hub" },
];

// Keys match the live system exactly, so the client's mental model carries over.
export const THEME_SETTINGS = {
  site_name: { value: "T-TEL", type: "text" },
  site_tagline: { value: "Transforming Teaching, Education and Learning", type: "text" },
  footer_text: {
    value: "T-TEL is a Ghanaian not-for-profit organization providing high quality technical advice, project management, research and implementation support services, using local talents and expertise to enhance learning outcomes and boost productivity in Ghana's education system.",
    type: "textarea",
  },
  copyright_text: { value: "T-TEL. All rights reserved.", type: "text" },
  accent_color: { value: "#027f6c", type: "color" },
  favicon_url: { value: "", type: "media" },
  logo_url: { value: "/images/logo-ink.png", type: "media" },
  logo_dark_url: { value: "/images/logo-white.png", type: "media" },

  default_theme: { value: "light", type: "select" },
  default_font_size: { value: "medium", type: "select" },
  default_language: { value: "en", type: "select" },
  enable_dark_mode: { value: true, type: "boolean" },
  enable_font_size: { value: true, type: "boolean" },
  enable_language: { value: true, type: "boolean" },
  enable_search: { value: true, type: "boolean" },
  enable_back_to_top: { value: true, type: "boolean" },

  homepage_slug: { value: "home", type: "text" },
  main_menu: { value: "main", type: "menu" },
  blog_label: { value: "News & Media", type: "text" },
  posts_per_page: { value: 9, type: "number" },
  show_blog: { value: true, type: "boolean" },
  cta_label: { value: "Contact Us", type: "text" },
  cta_url: { value: "/contact-us", type: "text" },
  show_cta_band: { value: true, type: "boolean" },
  cta_heading: { value: "Working on education in Ghana? Let’s talk.", type: "text" },
  cta_body: {
    value: "Ministries, funders, researchers and school leaders – we’re open to partnership at every level of the system.",
    type: "textarea",
  },
  cta_image: { value: "/images/cta-illustration.svg", type: "media" },
  cta_email_label: { value: "Email the team", type: "text" },
  cta_email: { value: "info@t-tel.org", type: "text" },
  cta_contact_label: { value: "Find our office", type: "text" },
  cta_contact_url: { value: "/contact-us", type: "text" },

  footer_links_heading: { value: "About Us", type: "text" },
  footer_menu_1: { value: "about-us", type: "menu" },
  footer_links_2_heading: { value: "Useful Links", type: "text" },
  footer_menu_2: { value: "footer-ii", type: "menu" },

  // ---- homepage sections ----
  hero_heading: { value: "We support government to strengthen Ghana's education system to reach greater heights", type: "textarea" },
  hero_video_url: { value: "/video/hero.mp4", type: "media" },
  hero_image_url: { value: "/images/hero/home.jpg", type: "media" },

  show_who: { value: true, type: "boolean" },
  home_who_heading: { value: "Who We Are", type: "text" },
  home_who_body: {
    value: "T-TEL is a Ghanaian not-for-profit organization providing high quality technical advice, project management, research and implementation support services, using local talents and expertise to enhance learning outcomes and boost productivity in Ghana's education system.",
    type: "textarea",
  },
  home_who_button_label: { value: "Learn More", type: "text" },
  home_who_button_url: { value: "/about-us", type: "text" },
  home_who_image: { value: "/images/photos/team-group.jpg", type: "media" },
  home_who_image_alt: { value: "The T-TEL team", type: "text" },

  show_strategic: { value: true, type: "boolean" },
  home_strategic_heading: { value: "Strategic Objectives", type: "text" },
  home_strategic_card1_icon: { value: "fa-graduation-cap", type: "text" },
  home_strategic_card1: {
    value: "Support the Government of Ghana to translate key national education policies and priorities – including the Education Strategic Plan (ESP) 2018 – 2030 and recommendations from the National Education Forum Committee – into coherent, implementable and measurable reforms.",
    type: "textarea",
  },
  home_strategic_card2_icon: { value: "fa-book-open", type: "text" },
  home_strategic_card2: {
    value: "Embed evidence, learning and adaptive delivery within Ghana's education institutions to ensure reforms sustain beyond programmes and lessons learnt are shared across Africa.",
    type: "textarea",
  },
  home_strategic_card3_icon: { value: "fa-landmark", type: "text" },
  home_strategic_card3: {
    value: "Strengthen T-TEL's institutional capability through strong leadership, governance and financial resilience.",
    type: "textarea",
  },

  show_articles: { value: true, type: "boolean" },
  home_articles_heading: { value: "Our Articles", type: "text" },
  show_focus: { value: true, type: "boolean" },
  home_focus_heading: { value: "Focus Areas", type: "text" },
  home_focus_intro: {
    value: "Our work is focused on transforming education for development through collaboration with the Ministry of Education and its agencies.",
    type: "textarea",
  },
  show_funders: { value: true, type: "boolean" },
  home_funders_heading: { value: "Funders", type: "text" },

  contact_form: { value: "contact-us", type: "form" },
  contact_email: { value: "info@t-tel.org", type: "text" },
  contact_phone: { value: "(+233) 055 435 7370", type: "text" },
  contact_address: { value: "Digital Address: GA-413-8387\nPMB L47 Legon\n9 Dzarkwei Close, East Legon, Accra", type: "textarea" },
  contact_hours: { value: "Monday – Friday\n8:00 AM – 5:00 PM GMT", type: "textarea" },
  contact_map_embed: { value: "https://maps.google.com/maps?q=TTEL%20Office%2C%20Accra&t=m&z=16&output=embed&iwloc=near", type: "textarea" },

  social_facebook: { value: "https://facebook.com/ttelghana/", type: "text" },
  social_facebook_icon: { value: "facebook", type: "select" },
  social_twitter: { value: "https://x.com/ttelghana", type: "text" },
  social_twitter_icon: { value: "twitter", type: "select" },
  social_instagram: { value: "https://www.instagram.com/ttelghana", type: "text" },
  social_instagram_icon: { value: "instagram", type: "select" },
  social_linkedin: { value: "https://gh.linkedin.com/company/transforming-teaching-education-learning", type: "text" },
  social_linkedin_icon: { value: "linkedin", type: "select" },
  social_youtube: { value: "https://www.youtube.com/channel/UCp7FYySxt91osDE4ASx4Ocw", type: "text" },
  social_youtube_icon: { value: "youtube", type: "select" },
  social_flickr: { value: "https://www.flickr.com/people/140304726@N07/", type: "text" },
  social_flickr_icon: { value: "flickr", type: "select" },
};

export const AUTH_SETTINGS = {
  allow_registration: { value: false, type: "boolean" },
  registration_role: { value: "user", type: "select" },
  registration_message: { value: "Public registration is currently disabled.", type: "text" },
};

export const CONTACT_FORM = {
  title: "Contact Us",
  slug: "contact-us",
  description: "General enquiry form used on the Contact page.",
  fields: [
    { type: "text", label: "Name", name: "name", required: true, placeholder: "Your name", width: "half" },
    { type: "email", label: "Email", name: "email", required: true, placeholder: "you@example.com", width: "half" },
    { type: "text", label: "Subject", name: "subject", required: false, placeholder: "What is this about?", width: "full" },
    { type: "textarea", label: "Message", name: "message", required: true, placeholder: "How can we help?", width: "full" },
  ],
  settings: {
    submitLabel: "Send message",
    buttonPosition: "left",
    successMessage: "Thanks for reaching out — we'll get back to you shortly.",
    notifyEmails: "info@t-tel.org",
    storeSubmissions: true,
    honeypot: true,
  },
  status: "active",
};

/**
 * Our History: the original page content, restructured as dated milestones so
 * it can be laid out as alternating image/text bricks instead of a wall of
 * prose. Lives in the page's `sections` bag so it stays editable.
 *
 * The Elementor demo captions that came across in the import ("Entering Stock
 * Market", "First Product Launch", "Timeline Item 1"…) are dropped — they were
 * theme placeholders, never T-TEL copy. The photographs are the originals,
 * pulled off the old uploads folder and served locally.
 */
export const OUR_HISTORY_MILESTONES = {
  type: "milestones",
  enabled: true,
  data: {
    intro: [
      "Transforming Teaching, Education & Learning (T-TEL) was established as an independent Ghanaian not-for-profit organisation on 7th July 2020.",
      "T-TEL was established after the successful completion of Transforming Teacher Education and Learning, a six-year $34 million Government of Ghana pre-service teacher training programme funded by the Foreign, Commonwealth & Development Office (FCDO) and implemented by Cambridge Education from 2014 to 2020.",
      "Transforming Teacher Education & Learning was a national teacher education reform programme owned by the Ministry of Education and led by the Ghana Tertiary Education Commission (GTEC). Its work centred on the introduction of a Bachelor in Education (B.Ed.) degree in Initial Teacher Education in all 46 public Colleges of Education (CoEs) affiliated to 5 public universities. It was seen by key stakeholders including FCDO and the Ministry of Education as a very successful programme which brought about significant changes in Ghana's teacher education system.",
    ],
    quote: {
      text: "Feedback for T-TEL's work has been consistently positive through this review process and the programme represents a very strong example of how technical assistance can support national scale reforms and implementation across the education system",
      attribution: "The programme's December 2019 annual review by FCDO",
    },
    // headings taken from revision_Ref/History.docx
    milestonesHeading: "The Journey So Far",
    milestonesSubheading: "A lifetime of creating impact together",
    milestones: [
      {
        year: "2014",
        date: "January 2014",
        title: "The programme begins",
        body: "Transforming Teacher Education & Learning programme established as a Government of Ghana pre-service teacher training programme funded by the Foreign, Commonwealth & Development Office (FCDO) and implemented by Cambridge Education.",
        image: "/images/history/2014-programme-launch.jpg",
      },
      {
        year: "2018",
        title: "A wider remit",
        body: "T-TEL's remit extended to focus on comprehensive teacher education policy reform led by the Ghana Tertiary Education Commission (GTEC).",
        image: "/images/history/2018-policy-reform.jpg",
      },
      {
        year: "2019",
        title: "Planning for what comes next",
        body: "T-TEL programme team explores options with the Ministry of Education to keep its work going after the FCDO programme ends.",
        image: "/images/history/2019-agm.jpg",
      },
      {
        year: "2020",
        date: "7th July 2020",
        title: "T-TEL is established",
        body: "On 7th July 2020, T-TEL was established as a Ghanaian, not-for-profit organisation to provide high quality technical advice, project management, research, and implementation support services, using local talent and expertise to enable Ghana's education system to reach greater heights.",
        image: "/images/history/2020-established.jpg",
      },
      {
        year: "2021",
        date: "February 2021",
        title: "Fully operational",
        body: "T-TEL becomes fully operational in February 2021 and commences its first three projects: T-SHEL in partnership with Mastercard Foundation, DeliverEd in partnership with the University of Oxford, and the COVID-19 Impact Assessment Study in partnership with EdTech Hub.",
        image: "/images/history/2021-operational.jpg",
        links: [
          { label: "T-SHEL", url: "/programmes/t-shel" },
          { label: "DeliverEd", url: "/programmes/delivered" },
          { label: "COVID-19 Impact Assessment Study", url: "/programmes/edtech-hub" },
        ],
      },
    ],
    closing: [
      "The Independent Commission on Aid Impact (ICAI)'s country report on UK aid to Ghana, published in February 2020, found that T-TEL's work on teacher training was the UK Government funded intervention in Ghana judged 'most likely to be sustained' due to its strong performance on institutional strengthening and \"strong signals that practice in Colleges of Education has changed.\"",
      "With this credible platform established the programme team, with the guidance of the then Minister of Education, Dr. Mathew Opoku Prempeh, and key educationists, explored options to keep this work going after the FCDO programme ended. Through discussions with the Ministry of Education and international donor agencies the organisation's founders identified the need for a competent, highly skilled Ghanaian Technical Assistance provider to assist the education system to articulate and achieve its policy goals. It was agreed that T-TEL was positioned to fill this gap within the Ghanaian education sector.",
      "The Mastercard Foundation agreed to explore the potential for future partnership and with this encouragement a group of 15 subscribers came together to develop T-TEL's constitution, vision, mission and guiding principles. These subscribers all have a strong commitment to improving the quality and relevance of learning outcomes across Ghana's education system. Their commitment and dedication ensured that T-TEL was formally registered in July 2020.",
      "Currently most large-scale TA programmes in Ghana involve international organisations who, whilst most of their employees may be Ghanaian, have leadership structures and processes based outside of the country. The aspiration to provide genuinely Ghanaian competition for these international organisations, using contextual expertise, understanding and rootedness to provide high quality services which deliver results and represent value for money is the driving force behind T-TEL.",
    ],
    links: [
      { label: "Read more about the FCDO funded Transforming Teacher Education and Learning Programme", url: "/programmes" },
      { label: "T-TEL Reports & Publications", url: "/knowledge-hub" },
    ],
  },
};

/**
 * Who We Are, structured to the approved design: an identity split, a
 * vision/mission band and the operating principles grid. Lives in the page's
 * `sections` bag so it stays editable.
 *
 * The principles came across from the import with six hotlinked icon PNGs on a
 * third-party staging server; the design numbers them instead, so the icons
 * are dropped rather than rehosted.
 */
export const ABOUT_US_SECTIONS = [
  {
    type: "identity",
    enabled: true,
    data: {
      // the client's own wording, from revision_Ref/aBOUT US.docx
      eyebrow: "Transforming Lives",
      heading: "A Ghanaian institution dedicated to the transformation of education.",
      highlight: "transformation",
      lead: "Transforming Teaching, Education & Learning (T-TEL) is a Ghanaian not-for-profit organisation that provides high quality technical advice, project management, research and implementation support services, using local talent and expertise to enable Ghana's education system to reach greater heights.",
      body: [
        "On 7th July 2020, T-TEL was established as a not-for-profit organisation following the successful completion of a six year (2014–2020) $34 million Government of Ghana programme funded by FCDO and implemented by Cambridge Education.",
        "This programme, also called T-TEL, was initially designed to strengthen pre-service teacher training. It grew into a large scale comprehensive teacher education policy reform programme owned by the Ministry of Education and led by the Ghana Tertiary Education Commission (GTEC). The T-TEL programme successfully helped GTEC to introduce a Bachelor in Education (B.Ed.) degree in Initial Teacher Education in all 46 public Colleges of Education (CoEs) through affiliation with 5 public universities, and was seen by key stakeholders including FCDO and the Ministry of Education as a very successful programme which brought about significant changes in Ghana's teacher education system. The programme ended in December 2020.",
        "It was this success that led to the decision to establish T-TEL as a Ghanaian not-for-profit organisation, providing a much broader range of advice and support to the Government of Ghana in its mission to transform Ghana's education system.",
      ],
    },
  },
  {
    type: "visionMission",
    enabled: true,
    data: {
      visionEyebrow: "The Vision",
      vision: "Transformed education for development.",
      missionEyebrow: "The Mission",
      mission: "To support government to strengthen Ghana's education system and deliver consistent improvements in teaching quality, equitable learning outcomes and skills development.",
      steps: [
        "Improving teaching quality",
        "Delivering equitable learning outcomes",
        "Building skills for development",
      ],
    },
  },
  {
    type: "principles",
    enabled: true,
    data: {
      eyebrow: "Our DNA",
      heading: "Operating Principles",
      principles: [
        {
          title: "Government-led and aligned with national priorities",
          body: "T-TEL aligns fully with government priorities and educational reforms. Our role is to strengthen existing systems whilst promoting Ghanaian expertise, rather than duplicating them.",
        },
        {
          title: "A whole-system approach to lasting change",
          body: "We support government to connect curriculum, assessment, pre-service and in-service teacher education, school leadership and motivation into a coherent reform agenda, ensuring reforms actively reduce existing inequalities in access, participation and learning outcomes.",
        },
        {
          title: "Using data and evidence to drive improvement",
          body: "We support the Ministry of Education to use robust data to inform decision-making at national, subnational and institutional level.",
        },
        {
          title: "Enabling government leadership",
          body: "Our role is to support government to achieve sustained improvements in teaching and learning rather than drawing attention to itself. Communication and behaviour change work focuses on helping government articulate its priorities and progress to stakeholders and Ghanaian citizens.",
        },
        {
          title: "Education as a driver of national identity and development",
          body: "Education shapes Ghana's sense of identity and purpose. We focus on ensuring curricula and learning materials embrace Ghanaian languages, culture and values alongside foundational literacy and numeracy.",
        },
        {
          title: "Robust internal systems for accountability and growth",
          body: "Our technical support is founded on robust internal financial, operational and audit systems that ensure transparency and continuous improvement.",
        },
      ],
    },
  },
];

export const PAGES = [
  { title: "Home", slug: "home", template: "landing", status: "published", isSystem: true },
  { title: "Who We Are", slug: "about-us", template: "inner", status: "published", isSystem: true },
  { title: "Our History", slug: "about-us/our-history", template: "inner", status: "published" },
  { title: "Our People", slug: "about-us/our-people", template: "inner", status: "published" },
  { title: "Our Partners", slug: "about-us/our-partners", template: "inner", status: "published" },
  { title: "Our Policies", slug: "about-us/our-policies", template: "inner", status: "published" },
  { title: "Focus Areas", slug: "focus-areas", template: "inner", status: "published" },
  { title: "Programmes", slug: "programmes", template: "inner", status: "published" },
  { title: "Knowledge Hub", slug: "knowledge-hub", template: "inner", status: "published" },
  { title: "News & Media", slug: "news-and-media", template: "inner", status: "published" },
  { title: "Join Us", slug: "join-us", template: "inner", status: "published" },
  { title: "Contact Us", slug: "contact-us", template: "contact", status: "published", isSystem: true },
];
