import type { Metadata } from "next";
import { IBM_Plex_Sans_KR } from "next/font/google";
import { Suspense } from "react";
import { NavigationTracker } from "@/app/ui/navigation-tracker";
import "./globals.css";

// 한글이 있는 글꼴(#53). 가변 글꼴이 아니라 굵기를 적는다.
const plexKr = IBM_Plex_Sans_KR({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-plex-kr",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Trip Planner",
  description: "여행 계획을 만들고 관리합니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${plexKr.variable} h-full font-sans antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* 여행 화면 "← 뒤로"가 쓰는 직전 주소(#122). 그리는 것은 없다. */}
        <Suspense fallback={null}>
          <NavigationTracker />
        </Suspense>
      </body>
    </html>
  );
}
