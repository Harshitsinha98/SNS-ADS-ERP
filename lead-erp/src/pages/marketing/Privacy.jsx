import LegalPageLayout from "./LegalPageLayout";

const UPDATED_AT = "July 16, 2026";

export default function Privacy() {
  return (
    <LegalPageLayout
      eyebrow="Privacy"
      title="Privacy Policy"
      updatedAt={UPDATED_AT}
      intro="This policy explains how Codeskate CRM handles business, account, and lead information when you use our customer relationship management platform."
    >
      <h2>1. Overview</h2>
      <p>Codeskate CRM helps businesses collect, organize, assign, and follow up with their own sales leads. In this policy, “you” and “your” mean the business or person using Codeskate CRM. “We”, “us”, and “our” mean Codeskate CRM.</p>

      <h2>2. Information we process</h2>
      <p>We process information that is needed to provide the platform, including:</p>
      <ul>
        <li>Workspace and account information such as names, organization details, phone numbers, role assignments, and billing-related records.</li>
        <li>Lead information entered by you or delivered through connected channels, such as a lead’s name, phone number, email address, enquiry, campaign source, messages, notes, and follow-up history.</li>
        <li>Operational information such as login events, integration status, notifications, usage records, and support communications.</li>
      </ul>

      <h2>3. How we use information</h2>
      <p>We use information to operate and secure Codeskate CRM, including to provide workspaces, route and assign leads, prevent duplicate records, deliver notifications, maintain integrations you authorize, process payments, respond to support requests, and improve reliability.</p>
      <p>We do not sell personal information. We do not use a customer’s lead information for unrelated advertising or to build marketing audiences for other customers.</p>

      <h2>4. Customer control and integrations</h2>
      <p>Each organization controls the data placed in its workspace. Administrators can manage team access, connected channels, and integrations. When you connect a service such as Meta Lead Ads, Google Ads, WhatsApp Business, or a website form, we process the information that service delivers so it can appear in your workspace.</p>
      <p>Connected providers process information under their own terms and privacy policies. You are responsible for ensuring that you have the appropriate notices, permissions, and lawful basis to collect and use lead information through your campaigns and forms.</p>

      <h2>5. Sharing and service providers</h2>
      <p>We share information only as needed to deliver the service, comply with law, protect rights and safety, or complete a transaction you request. This can include cloud hosting, authentication, payment, messaging, analytics, and customer-support providers. Providers are given access only to the information needed for their service.</p>

      <h2>6. Security</h2>
      <p>We use access controls, tenant separation, authenticated backend services, encrypted credential storage for supported integrations, and audit-oriented system records to help protect workspace data. No service can guarantee absolute security, so you should use strong account credentials and limit workspace access to authorized users.</p>

      <h2>7. Data retention and deletion</h2>
      <p>We retain information while your workspace is active and as reasonably necessary for the purposes described in this policy, legal obligations, dispute resolution, and enforcement. Workspace administrators may request assistance with export or deletion of their workspace data, subject to applicable legal and contractual requirements.</p>

      <h2>8. Your responsibilities</h2>
      <p>You are responsible for the lead data you collect, including providing any notices required by law, honoring marketing preferences, and keeping your team’s access accurate. Do not upload information you are not permitted to use.</p>

      <h2>9. Changes to this policy</h2>
      <p>We may update this policy when our product, legal obligations, or data practices change. We will publish the revised version on this page and update the “Last updated” date.</p>

      <h2>10. Contact</h2>
      <p>For privacy questions or data requests, contact us at <a href="mailto:customer@codeskate.app">customer@codeskate.app</a>.</p>
    </LegalPageLayout>
  );
}
