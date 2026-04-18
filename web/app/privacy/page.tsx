import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Kurator handles your data.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-kurator-fg md:text-3xl">Privacy Policy</h1>
      <p className="mt-2 text-sm text-kurator-muted">Last updated: April 18, 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-kurator-fg">
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-kurator-fg">Overview</h2>
          <p className="text-kurator-muted">
            Kurator (&quot;the app&quot;) is a collection tracker. This policy describes how information is
            handled when you use an instance of Kurator operated by you or your organization. Your deployment
            may customize hosting and support; contact whoever runs your server if you need specifics beyond
            this document.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-kurator-fg">Information you provide</h2>
          <ul className="list-inside list-disc space-y-2 text-kurator-muted">
            <li>
              <span className="text-kurator-fg">Account data:</span> email address and password (or
              equivalent credentials) used to sign in.
            </li>
            <li>
              <span className="text-kurator-fg">Profile information:</span> username (public URL), display
              name, bio, avatar, location, social links, visibility settings, and other fields you add to your
              profile.
            </li>
            <li>
              <span className="text-kurator-fg">Collection content:</span> titles, categories, metadata,
              cover images, wishlists, and any other items or notes you store in the app.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-kurator-fg">Automatically collected data</h2>
          <p className="text-kurator-muted">
            The application may use cookies or similar technologies for session management (keeping you signed
            in). Server logs, analytics, or error reporting depend on how your operator configures the
            deployment and infrastructure.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-kurator-fg">How we use information</h2>
          <p className="text-kurator-muted">
            Data is used to provide the service: authentication, storing your collections, showing public or
            shared content as you configure it, and operating features you enable (for example search or
            social follow relationships).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-kurator-fg">Where data lives</h2>
          <p className="text-kurator-muted">
            Kurator is designed to work with a database and file storage under your control. Data is not sent
            to Kurator as a company unless your deployment is configured to use external services (for example
            image hosting or APIs); those services have their own terms and privacy notices.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-kurator-fg">Your choices</h2>
          <p className="text-kurator-muted">
            You can update profile and collection data through the app where supported. To delete your
            account or exercise other rights, follow the process offered by whoever operates your instance, or
            use database and storage administration for self-hosted deployments.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-kurator-fg">Changes</h2>
          <p className="text-kurator-muted">
            This policy may be updated from time to time. The &quot;Last updated&quot; date at the top will
            change when revisions are published.
          </p>
        </section>
      </div>

      <p className="mt-12 text-sm text-kurator-muted">
        <Link href="/" className="text-kurator-accent hover:underline">
          Back to home
        </Link>
      </p>
    </div>
  );
}
