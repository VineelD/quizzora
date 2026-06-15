import { getDataHostingParagraphs } from "./data-hosting.js";
import { CURRENT_TERMS_VERSION } from "./terms.js";
import { getDonationCapLabel } from "./donation.js";
import { OPERATOR_CONTACT_EMAIL, OPERATOR_PRODUCT_NAME, operatorContextLine, operatorDisplayLine } from "./operator.js";

/**
 * Boilerplate Terms & Conditions sections for Australian ed-tech hobby project.
 * NOT LEGAL ADVICE — have a qualified lawyer review before relying on this text.
 */
export function getTermsSections() {
  const product = OPERATOR_PRODUCT_NAME;
  const operator = operatorDisplayLine();
  const operatorContext = operatorContextLine();
  const contact = OPERATOR_CONTACT_EMAIL;
  const privacyPath = "/legal/privacy";
  const donationCap = getDonationCapLabel();

  return [
    {
      id: "acceptance",
      title: "Acceptance of terms",
      paragraphs: [
        `By creating an account, accessing, or using ${product}, you agree to these Terms and Conditions ("Terms"). If you do not agree, do not use the service.`,
        `If you register on behalf of a school, family, or organisation, you represent that you have authority to bind that organisation to these Terms.`,
        `We may update these Terms from time to time. Material changes will be indicated by updating the "Last updated" date and version (${CURRENT_TERMS_VERSION}). Continued use after changes constitutes acceptance of the updated Terms.`,
      ],
    },
    {
      id: "service-description",
      title: "Service description",
      paragraphs: [
        `${product} is an educational technology platform operated voluntarily as a hobby by ${operator} — ${operatorContext}. It provides quiz generation, assignment delivery, study tools, progress reporting, and related features for schools, families, teachers, students, and guardians.`,
        `Features may change, be added, or be withdrawn. We do not guarantee that any particular feature will remain available, nor that the service will continue indefinitely.`,
      ],
    },
    {
      id: "accounts",
      title: "Accounts and registration",
      paragraphs: [
        `You must provide accurate registration information and keep your login credentials confidential. You are responsible for activity under your account.`,
        `School administrators and family account owners are responsible for managing user access, accurate student records, and lawful use of student data within their organisation.`,
        `Student accounts are typically created by teachers or parents; students must not share passwords or misuse another person's account.`,
        `We may suspend or terminate accounts that violate these Terms or pose a security or legal risk.`,
      ],
    },
    {
      id: "free-access-and-donations",
      title: "Free access and voluntary support",
      paragraphs: [
        `${product} is free for schools and families on the hosted service. No subscription or payment is required to register or use core features.`,
        `The operator may invite voluntary support (for example via an external donation link) to help cover hosting and AI costs. Any such contribution is optional, not required for access, and is not a purchase of goods or services. We suggest a maximum voluntary amount of ${donationCap}; you may give less or nothing.`,
        `Voluntary payments, if offered, may be processed by a third-party provider (for example PayPal, Ko-fi, or Stripe). Their terms apply to those transactions. We do not store raw card numbers on our servers.`,
      ],
    },
    {
      id: "acceptable-use",
      title: "Acceptable use",
      paragraphs: [
        `You must use ${product} only for lawful educational purposes and in compliance with applicable laws, including privacy and child-protection obligations.`,
        `You must not attempt to disrupt the service, circumvent access controls, scrape or reverse engineer the platform, upload unlawful or harmful content, harass others, or access data you are not authorised to view.`,
        `You must not use the service to generate, distribute, or promote content that is defamatory, discriminatory, obscene, or otherwise unlawful.`,
      ],
    },
    {
      id: "ai-content",
      title: "AI-generated content disclaimer",
      paragraphs: [
        `${product} may use artificial intelligence (including third-party models such as OpenAI) to generate quizzes, explanations, diagrams, study guidance, and related content.`,
        `AI output may be inaccurate, incomplete, biased, or unsuitable for a particular learner or curriculum context. It is provided for educational assistance only and is not professional, medical, legal, or other expert advice.`,
        `Teachers, parents, and schools remain responsible for reviewing content before use with students and for ensuring it meets their curriculum, safeguarding, and duty-of-care obligations.`,
      ],
    },
    {
      id: "educational-use",
      title: "Educational use only; minors and school use",
      paragraphs: [
        `${product} is intended for educational use. Where minors use the service, a school, parent, or guardian must ensure appropriate supervision and consent as required by law.`,
        `Schools using ${product} with students remain responsible for compliance with applicable education, privacy, and child-safety requirements in their jurisdiction.`,
        `The service is not a substitute for qualified teaching, assessment moderation, or safeguarding policies.`,
      ],
    },
    {
      id: "privacy",
      title: "Data and privacy",
      paragraphs: [
        `Our handling of personal information is described in our Privacy Policy (${privacyPath}). By using ${product}, you acknowledge that we process data as described there.`,
        `Schools and families are data controllers for much of the student information they upload; we act as a service provider processing that data on their instructions, subject to our agreements and applicable law.`,
      ],
    },
    {
      id: "data-hosting-and-storage",
      title: "Data hosting and storage",
      paragraphs: getDataHostingParagraphs(),
    },
    {
      id: "third-party",
      title: "Third-party services",
      paragraphs: [
        `${product} integrates with third-party services including OpenAI (AI features) and email delivery providers (for example Resend or configured SMTP). Optional voluntary support links may use separate payment providers. Your use of those features may be subject to the third party's terms and policies.`,
        `We are not responsible for third-party services outside our reasonable control, including outages, policy changes, or data handling by those providers beyond our integration.`,
      ],
    },
    {
      id: "disclaimers",
      title: "Disclaimers (as is)",
      paragraphs: [
        `To the maximum extent permitted by law, ${product} and all content are provided "as is" and "as available" without warranties of any kind, whether express, implied, or statutory, including implied warranties of merchantability, fitness for a particular purpose, accuracy, or non-infringement.`,
        `We do not warrant that the service will be uninterrupted, error-free, secure, or free of harmful components. The operator runs ${product} as a voluntary hobby project without commercial warranties.`,
        `Nothing in these Terms excludes, restricts, or modifies rights or remedies that cannot be excluded under the Australian Consumer Law.`,
      ],
    },
    {
      id: "limitation-of-liability",
      title: "Limitation of liability",
      paragraphs: [
        `To the maximum extent permitted by law, ${operator} will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for loss of profits, revenue, data, goodwill, or business opportunity, arising from or related to your use of ${product}.`,
        `To the maximum extent permitted by law, our aggregate liability for any claim arising from or related to these Terms or the service is limited to AUD $100.`,
        `These limitations apply whether liability arises in contract, tort (including negligence), statute, or otherwise, and even if we have been advised of the possibility of such loss.`,
        `You acknowledge that educational outcomes depend on many factors outside our control and that we are not liable for academic results, assessment decisions, or disputes between users.`,
      ],
    },
    {
      id: "indemnification",
      title: "Indemnification",
      paragraphs: [
        `You agree to indemnify and hold harmless ${operator} from and against claims, damages, losses, liabilities, costs, and expenses (including reasonable legal fees) arising from or related to: (a) your use of ${product}; (b) your breach of these Terms; (c) content you submit or cause to be generated; (d) your violation of law or third-party rights; or (e) wrongful or unfounded legal claims brought against us to the extent caused by your conduct or content.`,
        `We may assume the exclusive defence of any matter subject to indemnification, and you agree to cooperate reasonably with that defence.`,
      ],
    },
    {
      id: "termination",
      title: "Termination",
      paragraphs: [
        `You may stop using ${product} at any time. We may suspend or terminate access immediately if you breach these Terms, if required by law, or to protect the service or other users.`,
        `On termination, your right to access the service ends. Provisions that by nature should survive (including disclaimers, limitation of liability, indemnity, and governing law) continue to apply.`,
      ],
    },
    {
      id: "governing-law",
      title: "Governing law and dispute resolution",
      paragraphs: [
        `These Terms are governed by the laws of New South Wales, Australia. Each party submits to the non-exclusive jurisdiction of the courts of New South Wales and the Commonwealth of Australia.`,
        `Before commencing court proceedings (except urgent injunctive relief), a party must give written notice of the dispute and allow at least thirty (30) days for good-faith negotiation.`,
        `Nothing prevents either party from referring a consumer dispute to a relevant Australian consumer protection authority where applicable.`,
      ],
    },
    {
      id: "contact",
      title: "Contact",
      paragraphs: [
        `Questions about these Terms: ${contact}.`,
        `Operator: ${product} (${operator}, ${operatorContext}).`,
      ],
    },
  ];
}

export function getTermsMeta() {
  return {
    version: CURRENT_TERMS_VERSION,
    lastUpdatedLabel: "14 June 2026",
  };
}
