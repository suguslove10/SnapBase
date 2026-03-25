import Link from "next/link";
import Image from "next/image";

export const metadata = { title: "Refund Policy – SnapBase" };

export default function RefundPage() {
  return (
    <div className="min-h-screen" style={{ background: "#0a0f1e" }}>
      <div className="mx-auto max-w-3xl px-6 py-16">
        {/* Logo */}
        <Link href="/" className="mb-10 inline-flex items-center gap-2.5">
          <Image src="/logo.png" alt="SnapBase" width={32} height={32} className="rounded-xl" />
          <span className="font-grotesk text-lg font-semibold text-white">SnapBase</span>
        </Link>

        <h1 className="font-grotesk text-3xl font-bold text-white">Cancellation & Refund Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: March 25, 2026</p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-slate-400">
          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">1. Cancellation</h2>
            <p>You may cancel your SnapBase subscription at any time from your account settings or by contacting us at <a href="mailto:support@getsnapbase.com" className="text-[#00b4ff] hover:text-[#00f5d4]">support@getsnapbase.com</a>.</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Cancellation takes effect at the end of your current billing period.</li>
              <li>You will retain access to the Service until the end of the paid period.</li>
              <li>Your backup data will be available for download for 30 days after cancellation, after which it will be permanently deleted.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">2. Refunds</h2>
            <p>We offer refunds under the following conditions:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li><strong className="text-slate-300">7-day money-back guarantee:</strong> If you are not satisfied with the Service, you may request a full refund within 7 days of your first payment.</li>
              <li><strong className="text-slate-300">Service outages:</strong> If the Service experiences downtime exceeding 24 consecutive hours due to our fault, you may request a pro-rated refund for the affected period.</li>
              <li><strong className="text-slate-300">Billing errors:</strong> If you were charged incorrectly, we will issue a full refund for the erroneous amount.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">3. Non-Refundable Cases</h2>
            <p>Refunds will not be issued in the following cases:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Requests made after 7 days of the initial payment (except as stated above)</li>
              <li>Partial months or unused portions of a billing period (except for billing errors)</li>
              <li>Accounts suspended or terminated due to violation of our Terms of Service</li>
              <li>Annual plan renewals (we send a reminder 7 days before renewal)</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">4. How to Request a Refund</h2>
            <p>To request a refund, email us at <a href="mailto:support@getsnapbase.com" className="text-[#00b4ff] hover:text-[#00f5d4]">support@getsnapbase.com</a> with:</p>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              <li>Your account email address</li>
              <li>Reason for the refund request</li>
              <li>Transaction ID or date of payment</li>
            </ul>
            <p className="mt-3">We will process eligible refunds within 5–10 business days. Refunds are issued to the original payment method.</p>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">5. Free Plan</h2>
            <p>The free plan is provided at no cost and is not eligible for refunds. Free plan users may cancel or delete their account at any time.</p>
          </section>

          <section>
            <h2 className="mb-3 font-grotesk text-lg font-semibold text-white">6. Contact</h2>
            <p>For questions about this policy, contact us at <a href="mailto:support@getsnapbase.com" className="text-[#00b4ff] hover:text-[#00f5d4]">support@getsnapbase.com</a>.</p>
          </section>
        </div>

        <div className="mt-12 flex gap-6 border-t border-white/[0.06] pt-8 text-xs text-slate-600">
          <Link href="/terms" className="hover:text-slate-400">Terms of Service</Link>
          <Link href="/privacy" className="hover:text-slate-400">Privacy Policy</Link>
          <Link href="/" className="hover:text-slate-400">Home</Link>
        </div>
      </div>
    </div>
  );
}
