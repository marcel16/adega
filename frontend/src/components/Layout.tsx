import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  LayoutDashboard,
  Tv,
  Megaphone,
  Video,
  ListMusic,
  User,
  Bell,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || '';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
}

export default function Layout({ children, title }: LayoutProps) {
  const router = useRouter();
  const [cliente, setCliente] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    const stored = localStorage.getItem('cliente');
    if (stored) {
      setCliente(JSON.parse(stored));
    }
  }, []);

  const logout = () => {
    localStorage.clear();
    router.push('/login');
  };

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/promocoes', label: 'Promoções', icon: Megaphone },
    { href: '/midias', label: 'Mídias', icon: Video },
    { href: '/playlists', label: 'Playlists', icon: ListMusic },
    { href: '/perfil', label: 'Perfil', icon: User },
    { href: '/notificacoes', label: 'Notificações', icon: Bell },
  ];

  const isActive = (href: string) => router.pathname === href;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-gray-800 border-r border-gray-700 flex flex-col transform transition-transform lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-5 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-amber-400">🍷 Adega</h1>
            <p className="text-xs text-gray-500 mt-0.5">{cliente?.nomeAdega || 'Carregando...'}</p>
          </div>
          <button
            className="lg:hidden text-gray-400 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.href}
                onClick={() => {
                  router.push(item.href);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                  isActive(item.href)
                    ? 'bg-amber-600/20 text-amber-400 font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-gray-700">
          {cliente && (
            <div className="flex items-center gap-3 px-3 py-2 mb-2">
              {cliente.logo ? (
                <img src={cliente.logo} alt="Logo" className="h-8 w-8 rounded object-cover" />
              ) : (
                <div className="h-8 w-8 rounded bg-gray-700 flex items-center justify-center text-sm font-bold">
                  {cliente.nomeAdega?.charAt(0) || 'A'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{cliente.nome}</p>
                <p className="text-xs text-gray-500 truncate">{cliente.email}</p>
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-red-900/20 transition"
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="bg-gray-800 border-b border-gray-700 px-4 lg:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden text-gray-400 hover:text-white"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={22} />
            </button>
            <h2 className="text-lg font-semibold">{title || 'Dashboard'}</h2>
          </div>
          <div className="flex items-center gap-3">
            {cliente?.plano && (
              <span className="hidden sm:inline bg-amber-600/20 text-amber-400 px-3 py-1 rounded-full text-xs font-medium">
                Plano {cliente.plano.nome}
              </span>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
