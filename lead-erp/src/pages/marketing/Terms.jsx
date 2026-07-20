import LegalPageLayout from "./LegalPageLayout";

const UPDATED_AT = "July 16, 2026";

export default function Terms() {
  return (
    <LegalPageLayout
      eyebrow="Legal"
      title="Terms and Conditions"
      updatedAt={UPDATED_AT}
      intro="These terms govern access to and use of Codeskate CRM. Please read them before creating a workspace or connecting a business channel."
    >
      <h2>1. Acceptance of these terms</h2>
      <p>By creating an account, starting a trial, purchasing a plan, connecting an integration, or using Codeskate CRM, you agree to these Terms and Conditions. If you use the service for an organization, you confirm that you have authority to accept these terms for that organization.</p>

      <h2>2. The service</h2>
      <p>Codeskate CRM provides customer relationship management features, including lead intake, assignment, follow-up workflows, sales reporting, and supported third-party integrations. Features may vary by plan, provider availability, product updates, and applicable limits.</p>

      <h2>3. Accounts and workspace access</h2>
      <p>You must provide accurate information, protect account credentials, and promptly remove access for people who should no longer use your workspace. Workspace owners and administrators are responsible for their invited users, settings, integrations, and actions performed through their organization.</p>

      <h2>4. Your data and connected services</h2>
      <p>You retain responsibility for information you submit or collect through Codeskate CRM. You confirm that you have the required permissions and legal basis to collect, upload, contact, and process your leads.</p>
      <p>When you connect third-party services such as Meta Lead Ads, Google Ads, WhatsApp Business, or a website form, you authorize us to process the available data solely to provide the requested integration. Your use of those services is also governed by their own terms, policies, and platform requirements.</p>

      <h2>5. Acceptable use</h2>
      <p>You must not use Codeskate CRM to break the law, send unsolicited or deceptive communications, violate another person’s privacy, upload harmful code, interfere with the service, attempt unauthorized access, or use the platform in a way that harms others or breaches provider policies.</p>

      <h2>6. Plans, trials, and payments</h2>
      <p>Trials, pricing, plan limits, renewals, and payment methods are shown during checkout or within your billing area. You are responsible for applicable taxes and for keeping payment details current. If payment is not completed or a plan ends, access and features may be limited according to the applicable plan and billing status.</p>

      <h2>7. Availability and support</h2>
      <p>We work to keep the service available and reliable, but features may be changed, maintained, suspended, or discontinued when reasonably necessary. Third-party integrations can be affected by provider outages, approvals, API changes, permissions, or account restrictions that are outside our control.</p>

      <h2>8. Intellectual property</h2>
      <p>Codeskate CRM, its software, branding, and product materials are owned by or licensed to us. We grant you a limited, non-transferable right to use the service during your active subscription in accordance with these terms. You keep ownership of your organization’s data.</p>

      <h2>9. Limitation of liability</h2>
      <p>To the extent permitted by applicable law, Codeskate CRM is provided on an “as available” basis. We are not responsible for indirect, incidental, special, consequential, or punitive losses, or for issues caused by third-party platforms, your data, your users, or circumstances outside our reasonable control.</p>

      <h2>10. Changes and termination</h2>
      <p>We may update these terms to reflect changes to the service, law, or business operations. Continued use after an updated version takes effect means you accept the revised terms. You may stop using the service at any time. We may suspend or terminate access when necessary to protect the platform, comply with law, or address a material breach of these terms.</p>

      <h2>11. Contact</h2>
      <p>For questions about these terms, contact <a href="mailto:hello@codeskate.com">hello@codeskate.com</a>.</p>
    </LegalPageLayout>
  );
}
