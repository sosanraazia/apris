import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { getSession } from "@/lib/auth";
import { logoutAction } from "./login/actions";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "APRIS — Academic Progression & Registration",
  description: "DHA Suffa University registration intelligence",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const s = await getSession();
  const nav = [
    { href: "/", label: "Dashboard" },
    { href: "/students", label: "Students" },
    ...(s && s.role !== "ADVISOR" ? [{ href: "/exceptions", label: "Exceptions" }] : []),
    ...(s?.role === "ADMIN" ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        {s && (
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-7xl items-center gap-6 px-5 py-3">
              <Link href="/" className="text-base font-bold tracking-tight text-brand">APRIS</Link>
              <nav className="flex gap-1 text-sm">
                {nav.map((n) => (
                  <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100">{n.label}</Link>
                ))}
              </nav>
              <div className="ml-auto flex items-center gap-3 text-sm text-slate-600">
                <Link href="/account" className="hover:underline">{s.name} · <span className="font-medium">{s.role}</span></Link>
                <form action={logoutAction}><button className="rounded-md border border-slate-300 px-2.5 py-1 hover:bg-slate-50">Sign out</button></form>
              </div>
            </div>
          </header>
        )}
        <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
      </body>
    </html>
  );
}
