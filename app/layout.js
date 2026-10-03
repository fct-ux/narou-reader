import './styles.css';

export const metadata = {
  title: 'なろうReader',
  description: '小説家になろうを読みやすくする個人用リーダー',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'なろうReader', statusBarStyle: 'black-translucent' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
