import { Inter } from "next/font/google";
import { Provider } from "@/components/provider";
import type { Metadata } from "next";
import "./global.css";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://congenial-adventure-r229nj4.pages.github.io"),
  title: {
    default: "never-rest",
    template: "%s | never-rest",
  },
  description:
    "HTTP contracts where handlers return Result instead of throwing. Graded disclosure and cause chains across service boundaries.",
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
