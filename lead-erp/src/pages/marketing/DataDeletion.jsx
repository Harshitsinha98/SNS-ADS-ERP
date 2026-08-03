import LegalPageLayout from "./LegalPageLayout";

const UPDATED_AT = "August 3, 2026";

export default function DataDeletion() {
  return (
    <LegalPageLayout
      eyebrow="Data deletion"
      title="Data Deletion Instructions"
      updatedAt={UPDATED_AT}
      intro="This page explains how you can request deletion of the personal data that Codeskate CRM holds about you or your workspace."
    >
      <h2>1. Overview</h2>
      <p>Codeskate CRM helps businesses collect, organize, and follow up with their own sales leads. We only process data needed to provide the platform. If you want your personal data — or your workspace’s data — deleted, you can request it using the steps below.</p>

      <h2>2. What data can be deleted</h2>
      <p>On request, we can delete the personal information associated with your account or workspace, including:</p>
      <ul>
        <li>Account and profile information such as your name, phone number, and role assignments.</li>
        <li>Lead information stored in your workspace, such as a lead’s name, phone number, email address, enquiries, messages, notes, and follow-up history.</li>
        <li>Any data received through connected channels you authorized (for example WhatsApp Business, Meta Lead Ads, Google Ads, or website forms).</li>
      </ul>

      <h2>3. How to request deletion</h2>
      <p>To request deletion of your data, send an email to <a href="mailto:hello@codeskate.com">hello@codeskate.com</a> from the email address or with the phone number linked to your account, and include:</p>
      <ul>
        <li>The subject line: <strong>“Data Deletion Request”</strong>.</li>
        <li>Your registered name and the phone number used to sign in.</li>
        <li>Your workspace / organization name, if you know it.</li>
        <li>Whether you want your entire workspace deleted or only specific records.</li>
      </ul>
      <p>We may contact you to verify your identity before processing the request, to protect your data from unauthorized deletion.</p>

      <h2>4. What happens next</h2>
      <p>Once verified, we will delete the requested personal data from our active systems, typically within 30 days. Some information may remain for a limited period in secure backups or where retention is required to comply with legal obligations, resolve disputes, or enforce our agreements. It is removed from backups on their normal expiry cycle.</p>

      <h2>5. Workspace administrators</h2>
      <p>If you are a workspace administrator, deleting your workspace will remove the lead and account data it contains. Please make sure you have exported anything you need to keep before requesting deletion, as this action cannot be undone.</p>

      <h2>6. Connected platforms</h2>
      <p>Data held by connected providers (for example Meta / WhatsApp Business) is governed by their own terms and privacy policies. Deleting data from Codeskate CRM does not automatically delete data held by those providers; you may need to submit a separate request to them.</p>

      <h2>7. Contact</h2>
      <p>For any questions about data deletion or to submit a request, contact us at <a href="mailto:hello@codeskate.com">hello@codeskate.com</a>.</p>
    </LegalPageLayout>
  );
}
