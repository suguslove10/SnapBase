import Link from "next/link";
import Image from "next/image";

export const metadata = { title: "Terms of Service – SnapBase" };

export default function TermsPage() {
  return (
    <div className="min-h-screen" style={{ background: "#0a0f1e" }}>
      <div className="mx-auto max-w-3xl px-6 py-16">
        {/* Logo */}
        <Link href="/" className="mb-10 inline-flex items-center gap-2.5">
          <Image src="/logo.png" alt="SnapBase" width={32} height={32} className="rounded-xl" />
          <span className="font-grotesk text-lg font-semibold text-white">SnapBase</span>
        </Link>

        <h1 className="font-grotesk text-3xl font-bold text-white">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: March 25, 2026</p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-slate-400">
          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">1. Acceptance of Terms</h2>
            <p>By accessing or using SnapBase (&ldquo;Service&rdquo;), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Service.</p>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">2. Description of Service</h2>
            <p>SnapBase is an automated database backup service that enables users to schedule, store, and manage backups of their databases. The Service includes backup scheduling, storage management, anomaly detection, and restore functionality.</p>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">3. User Accounts</h2>
            <p>You must create an account to use the Service. You are responsible for maintaining the confidentiality of your credentials and for all activities under your account. You must notify us immediately of any unauthorized use at support@getsnapbase.com.</p>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">4. Acceptable Use</h2>
            <p>You agree not to misuse the Service. Prohibited activities include but are not limited to: using the Service to store illegal content, attempting to gain unauthorized access to other users&apos; data, overloading the infrastructure, or reverse-engineering the Service.</p>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">5. Payment and Billing</h2>
            <p>Paid plans are billed in advance on a monthly or annual basis. All fees are non-refundable except as described in our Refund Policy. We reserve the right to change pricing with 30 days&apos; notice.</p>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">6. Data and Security</h2>
            <p>You retain ownership of all data you back up through SnapBase. We store your backup data securely using AES-256 encryption. We do not access your data except as necessary to provide the Service or as required by law.</p>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">7. Availability and Uptime</h2>
            <p>We strive for high availability but do not guarantee uninterrupted access to the Service. We are not liable for data loss resulting from service outages. You are responsible for maintaining independent backups of critical data.</p>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">8. Termination</h2>
            <p>You may cancel your account at any time. We reserve the right to suspend or terminate accounts that violate these Terms. Upon termination, your data will be retained for 30 days before permanent deletion.</p>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">9. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, SnapBase shall not be liable for indirect, incidental, or consequential damages arising from use of the Service. Our total liability shall not exceed the amount paid by you in the 3 months prior to the claim.</p>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">10. Governing Law</h2>
            <p>These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in Bangalore, Karnataka, India.</p>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">11. Contact</h2>
            <p>For questions about these Terms, contact us at <a href="mailto:support@getsnapbase.com" className="text-[#00b4ff] hover:text-[#00f5d4]">support@getsnapbase.com</a>.</p>
          </section>
        </div>

        <div className="mt-12 flex gap-6 border-t border-white/[0.06] pt-8 text-xs text-slate-600">
          <Link href="/privacy" className="hover:text-slate-400">Privacy Policy</Link>
          <Link href="/refund" className="hover:text-slate-400">Refund Policy</Link>
          <Link href="/" className="hover:text-slate-400">Home</Link>
        </div>
      </div>
    </div>
  );
}
