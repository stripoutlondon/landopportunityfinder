import "./globals.css";
import "./sprint3.css";
import "leaflet/dist/leaflet.css";

export const metadata = {
  title: "Land Opportunity Finder",
  description: "AI-assisted off-market land opportunity intelligence",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
