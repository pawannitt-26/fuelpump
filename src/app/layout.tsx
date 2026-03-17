import type { Metadata, Viewport } from 'next';
import './globals.css';
import ClientWrapper from '@/components/ClientWrapper';
import InstallPrompt from '@/components/InstallPrompt';

export const viewport: Viewport = {
  themeColor: '#2563eb',
};

export const metadata: Metadata = {
  title: 'Fuel Station System',
  description: 'Fuel Station Shift & DSR Management System',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Fuel Station',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
      </head>
      <body>
        <ClientWrapper>{children}</ClientWrapper>
        <InstallPrompt />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function(registration) {
                      console.log('ServiceWorker registration successful');
                    },
                    function(err) {
                      console.log('ServiceWorker registration failed: ', err);
                    }
                  );
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
