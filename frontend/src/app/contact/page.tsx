import Link from "next/link";

export const metadata = { title: "Contact & Support – SnapBase" };

export default function ContactPage() {
  return (
    <div className="min-h-screen" style={{ background: "#0a0f1e" }}>
      <div className="mx-auto max-w-3xl px-6 py-16">
        {/* Logo */}
        <Link href="/" className="mb-10 inline-flex items-center gap-2.5">
          <img src="/logo-icon.png" alt="SnapBase" style={{height:"32px",width:"auto"}} />
          <span className="font-grotesk text-lg font-semibold text-white">SnapBase</span>
        </Link>

        <h1 className="font-grotesk text-3xl font-bold text-white">Contact & Support</h1>
        <p className="mt-2 text-sm text-slate-500">We&apos;re here to help. Reach out anytime.</p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {/* Email */}
          <div
            className="rounded-2xl p-6"
            style={{ background: "rgba(13,21,38,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <p className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Email Support</p>
            <a
              href="mailto:support@getsnapbase.com"
              className="mt-2 block font-grotesk text-lg font-semibold text-[#00b4ff] transition hover:text-[#00f5d4]"
            >
              support@getsnapbase.com
            </a>
            <p className="mt-2 text-sm text-slate-500">We respond within 24 hours on business days.</p>
          </div>

          {/* Phone */}
          <div
            className="rounded-2xl p-6"
            style={{ background: "rgba(13,21,38,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <p className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Phone Support</p>
            <a
              href="tel:+918660844123"
              className="mt-2 block font-grotesk text-lg font-semibold text-white transition hover:text-[#00b4ff]"
            >
              +91 866-0844123
            </a>
            <p className="mt-2 text-sm text-slate-500">Mon – Fri, 10 AM – 6 PM IST</p>
          </div>

          {/* Address */}
          <div
            className="rounded-2xl p-6 sm:col-span-2"
            style={{ background: "rgba(13,21,38,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <p className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Registered Address</p>
            <p className="mt-2 font-grotesk text-base font-semibold text-white">SnapBase</p>
            <p className="mt-1 text-sm text-slate-400">
              Bangalore, Karnataka, India – 560001
            </p>
          </div>
        </div>

        <div className="mt-12 flex gap-6 border-t border-white/[0.06] pt-8 text-xs text-slate-600">
          <Link href="/terms" className="hover:text-slate-400">Terms of Service</Link>
          <Link href="/privacy" className="hover:text-slate-400">Privacy Policy</Link>
          <Link href="/refund" className="hover:text-slate-400">Refund Policy</Link>
          <Link href="/" className="hover:text-slate-400">Home</Link>
        </div>
      </div>
    </div>
  );
}
