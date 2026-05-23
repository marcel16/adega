import type { AppProps } from 'next/app';
import { Toaster } from 'react-hot-toast';
import 'tailwindcss/tailwind.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <Toaster position="top-right" toastOptions={{
        style: { background: '#1f2937', color: '#fff', border: '1px solid #374151' },
      }} />
    </>
  );
}
