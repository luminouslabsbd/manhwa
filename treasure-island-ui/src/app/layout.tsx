import type { Metadata } from "next";
import "./globals.css";
import { getSession } from "@/lib/auth";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: "Manhwa Studio",
  description: "AI-powered manhwa/webtoon production control panel",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en">
      <body>
        {session && <NavBar name={session.name} email={session.email} role={session.role} impersonator={session.impersonator} />}
        {children}
      </body>
    </html>
  );
}
