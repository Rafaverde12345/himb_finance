import "./globals.css";

export const metadata = {
  title: "HIMB",
  description: "Plataforma independiente de gestion financiera y patrimonial.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
