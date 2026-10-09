import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const beVietnam = Be_Vietnam_Pro({ subsets: ["vietnamese", "latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });
export const metadata: Metadata = {
  title: "CityPass — Bản đồ mưa và cảnh báo ngập",
  description: "Theo dõi lớp radar mưa, tín hiệu ngập có nguồn gốc và so sánh tuyến đường ít điểm rủi ro được báo cáo hơn.",
  openGraph: { title: "CityPass — Bản đồ mưa và cảnh báo ngập", description: "Không coi thiếu báo cáo là an toàn.", type: "website" },
  robots: { index: false, follow: false }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body className={beVietnam.className}>{children}</body></html>;
}
