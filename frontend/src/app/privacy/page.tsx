import Link from "next/link";

export const metadata = { title: "Privacy Policy – SnapBase" };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ background: "#0a0f1e" }}>
      <div className="mx-auto max-w-3xl px-6 py-16">
        {/* Logo */}
        <Link href="/" className="mb-10 inline-flex items-center gap-2.5">
          <img src="/logo-icon.png" alt="SnapBase" style={{height:"44px",width:"auto"}} />
          <span className="font-grotesk text-lg font-semibold text-white">SnapBase</span>
        </Link>

        <h1 className="font-grotesk text-3xl font-bold text-white">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: March 25, 2026</p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-slate-400">
          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">1. Information We Collect</h2>
            <p>We collect information you provide directly, including:</p>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              <li>Account information: name, email address, password (hashed)</li>
              <li>Database connection details: host, port, database name, credentials (encrypted at rest with AES-256)</li>
              <li>Payment information: processed by Stripe — we do not store card numbers</li>
              <li>Usage data: backup logs, schedule configurations, storage usage</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">2. How We Use Your Information</h2>
            <p>We use collected information to:</p>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              <li>Provide, operate, and improve the Service</li>
              <li>Execute automated database backups on your behalf</li>
              <li>Send backup status notifications and alerts</li>
              <li>Process payments and manage subscriptions</li>
              <li>Respond to support requests</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">3. Data Storage and Security</h2>
            <p>Your backup data is stored encrypted using AES-256-GCM. Database credentials are encrypted before being stored in our database. We use industry-standard security practices including TLS for data in transit. Access to production systems is restricted to authorized personnel only.</p>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">4. Data Sharing</h2>
            <p>We do not sell your personal information. We share data only with:</p>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              <li><strong className="text-slate-300">Stripe</strong> — for payment processing</li>
              <li><strong className="text-slate-300">Cloud storage providers</strong> — to store your backup files (MinIO/S3, as configured by you)</li>
              <li><strong className="text-slate-300">Law enforcement</strong> — when required by applicable law</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">5. Data Retention</h2>
            <p>Backup files are retained according to your configured retention policy (default: 30 days). Account data is retained for the duration of your subscription plus 30 days after cancellation. You may request deletion of your data at any time by contacting support.</p>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">6. Your Rights</h2>
            <p>You have the right to access, correct, export, or delete your personal data. To exercise these rights, contact us at <a href="mailto:support@getsnapbase.com" className="text-[#00b4ff] hover:text-[#00f5d4]">support@getsnapbase.com</a>. We will respond within 30 days.</p>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">7. Cookies</h2>
            <p>We use only essential cookies required for authentication and session management. We do not use tracking or advertising cookies.</p>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">8. Third-Party OAuth</h2>
            <p>If you sign in with GitHub or Google, we receive your name, email, and profile picture from those providers. We do not receive or store your OAuth provider passwords.</p>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">9. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of significant changes via email or a notice on the Service. Continued use of the Service after changes constitutes acceptance.</p>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">10. Contact</h2>
            <p>For privacy-related questions, contact us at <a href="mailto:support@getsnapbase.com" className="text-[#00b4ff] hover:text-[#00f5d4]">support@getsnapbase.com</a>.</p>
          </section>
        </div>

        <div className="mt-12 flex gap-6 border-t border-white/[0.06] pt-8 text-xs text-slate-600">
          <Link href="/terms" className="hover:text-slate-400">Terms of Service</Link>
          <Link href="/refund" className="hover:text-slate-400">Refund Policy</Link>
          <Link href="/" className="hover:text-slate-400">Home</Link>
        </div>
      </div>
    </div>
  );
}
