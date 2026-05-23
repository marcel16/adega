import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Bell,
  Send,
  Users,
  User,
  Search,
  Store,
  Check,
  Loader2,
  Megaphone,
  Info,
  AlertTriangle,
  Gift,
  Mail,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || '';

interface Cliente {
  id: string;
  nome: string;
  nomeAdega: string;
  email: string;
  ativo: boolean;
}

export default function AdminNotificar() {
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);

  // Form
  const [modo, setModo] = useState<'broadcast' | 'individual'>('broadcast');
  const [titulo, setTitulo] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [tipo, setTipo] = useState<'info' | 'alerta' | 'promocao' | 'fatura' | 'sistema'>('info');
  const [selectedClienteIds, setSelectedClienteIds] = useState<Set<string>>(new Set());

  // Preview
  const [previewOpen, setPreviewOpen] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;

  useEffect(() => {
    if (!token) {
      router.push('/admin/login');
      return;
    }
    loadClientes();
  }, []);

  const loadClientes = async () => {
    try {
      const { data } = await axios.get(`${API}/api/admin/clientes`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 1000, ativos: true },
      });
      setClientes(data.data || data);
    } catch {
      toast.error('Erro ao carregar clientes');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!titulo.trim()) {
      toast.error('Informe o título da notificação');
      return;
    }
    if (!mensagem.trim()) {
      toast.error('Informe a mensagem');
      return;
    }

    if (modo === 'individual' && selectedClienteIds.size === 0) {
      toast.error('Selecione pelo menos um cliente');
      return;
    }

    setSending(true);
    try {
      const payload: any = {
        titulo: titulo.trim(),
        mensagem: mensagem.trim(),
        tipo,
      };

      if (modo === 'individual') {
        payload.clienteIds = Array.from(selectedClienteIds);
      } else {
        payload.broadcast = true;
      }

      await axios.post(`${API}/api/admin/notificar`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const count = modo === 'broadcast' ? clientes.length : selectedClienteIds.size;
      toast.success(`Notificação enviada para ${count} cliente(s)!`);

      // Reset form
      setTitulo('');
      setMensagem('');
      setTipo('info');
      setSelectedClienteIds(new Set());
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao enviar notificação');
    } finally {
      setSending(false);
    }
  };

  const toggleCliente = (id: string) => {
    setSelectedClienteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const filtered = filterClientes();
    if (selectedClienteIds.size === filtered.length) {
      setSelectedClienteIds(new Set());
    } else {
      setSelectedClienteIds(new Set(filtered.map((c) => c.id)));
    }
  };

  const filterClientes = () => {
    if (!search) return clientes;
    const q = search.toLowerCase();
    return clientes.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        c.nomeAdega.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
    );
  };

  const tipos = [
    { value: 'info', label: 'Info', icon: Info, color: 'text-blue-400', bg: 'bg-blue-900/20' },
    { value: 'alerta', label: 'Alerta', icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-900/20' },
    { value: 'promocao', label: 'Promoção', icon: Gift, color: 'text-amber-400', bg: 'bg-amber-900/20' },
    { value: 'fatura', label: 'Fatura', icon: Mail, color: 'text-green-400', bg: 'bg-green-900/20' },
    { value: 'sistema', label: 'Sistema', icon: Megaphone, color: 'text-purple-400', bg: 'bg-purple-900/20' },
  ];

  const filtered = filterClientes();

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 p-4 flex flex-col">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-amber-400">🍷 Adega Admin</h1>
          <p className="text-xs text-gray-500 mt-1">Notificar</p>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {[
            { href: '/admin', label: '📊 Dashboard' },
            { href: '/admin/campanhas', label: '📢 Campanhas' },
            { href: '/admin/faturas', label: '💰 Faturas' },
            { href: '/admin/notificar', label: '🔔 Notificar', active: true },
          ].map((item) => (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`text-left px-3 py-2 rounded-lg text-sm transition ${
                item.active
                  ? 'bg-amber-600/20 text-amber-400'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button
          onClick={() => {
            localStorage.clear();
            router.push('/admin/login');
          }}
          className="text-gray-500 hover:text-red-400 text-sm text-left px-3 py-2"
        >
          ← Sair
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6 overflow-auto">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Bell size={24} className="text-amber-400" />
            Enviar Notificação
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Envie notificações push para os clientes ou um broadcast geral
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form Column */}
          <div className="lg:col-span-2">
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
              {/* Modo */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-400 mb-2">Modo de Envio</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setModo('broadcast');
                      setSelectedClienteIds(new Set());
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition border ${
                      modo === 'broadcast'
                        ? 'bg-amber-600/20 border-amber-600/30 text-amber-400'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    <Users size={18} />
                    Broadcast
                    <span className="text-xs ml-1">(todos {clientes.length})</span>
                  </button>
                  <button
                    onClick={() => setModo('individual')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition border ${
                      modo === 'individual'
                        ? 'bg-amber-600/20 border-amber-600/30 text-amber-400'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    <User size={18} />
                    Individual
                    {selectedClienteIds.size > 0 && (
                      <span className="text-xs ml-1">({selectedClienteIds.size})</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Tipo */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-400 mb-2">Tipo</label>
                <div className="flex flex-wrap gap-1">
                  {tipos.map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.value}
                        onClick={() => setTipo(t.value as any)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition border ${
                          tipo === t.value
                            ? `${t.bg} ${t.color} border-current/30`
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                        }`}
                      >
                        <Icon size={14} />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Título */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-400 mb-1">Título *</label>
                <input
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
                  placeholder="Ex: Nova promoção disponível!"
                />
              </div>

              {/* Mensagem */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-400 mb-1">Mensagem *</label>
                <textarea
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400 resize-none"
                  placeholder="Escreva a mensagem da notificação..."
                  rows={5}
                />
                <p className="text-xs text-gray-600 mt-1 text-right">
                  {mensagem.length} caracteres
                </p>
              </div>

              {/* Send Button */}
              <div className="flex justify-end">
                <button
                  onClick={handleSend}
                  disabled={sending || !titulo.trim() || !mensagem.trim()}
                  className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 px-6 py-3 rounded-lg text-sm font-medium transition"
                >
                  {sending ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send size={18} />
                      Enviar Notificação
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Preview Column */}
          <div>
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 sticky top-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                Pré-visualização
              </h3>

              {/* Notification Preview */}
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-lg ${
                      tipos.find((t) => t.value === tipo)?.bg || 'bg-gray-700'
                    }`}
                  >
                    {(() => {
                      const t = tipos.find((tt) => tt.value === tipo);
                      if (!t) return <Bell size={18} className="text-gray-400" />;
                      const Icon = t.icon;
                      return <Icon size={18} className={t.color} />;
                    })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold">
                      {titulo || 'Título da notificação'}
                    </h4>
                    <p className="text-xs text-gray-400 mt-1">
                      {mensagem || 'Mensagem da notificação aparecerá aqui...'}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] text-gray-600">Agora mesmo</span>
                      <span className="text-[10px] bg-gray-700 px-1.5 py-0.5 rounded capitalize">
                        {tipo}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="mt-6 space-y-3 text-sm">
                <div className="flex items-center gap-2 text-gray-400">
                  <Send size={14} className="text-gray-600" />
                  <span>
                    Enviando para:{' '}
                    <strong className="text-white">
                      {modo === 'broadcast'
                        ? `${clientes.length} clientes`
                        : `${selectedClienteIds.size} cliente(s)`}
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Cliente Selection (individual mode) */}
        {modo === 'individual' && (
          <div className="mt-6 bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Users size={18} className="text-amber-400" />
                Selecionar Clientes ({selectedClienteIds.size}/{clientes.length})
              </h3>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar cliente..."
                    className="pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400 w-56"
                  />
                </div>
                <button
                  onClick={selectAll}
                  className="text-xs text-amber-400 hover:text-amber-300 px-2 py-1"
                >
                  {selectedClienteIds.size === filtered.length ? 'Desmarcar todos' : 'Selecionar todos'}
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-8 text-gray-500">
                <Loader2 size={20} className="animate-spin mx-auto" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                Nenhum cliente encontrado
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto divide-y divide-gray-800/50">
                {filtered.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-4 px-6 py-3 hover:bg-gray-800/30 cursor-pointer transition"
                  >
                    <input
                      type="checkbox"
                      checked={selectedClienteIds.has(c.id)}
                      onChange={() => toggleCliente(c.id)}
                      className="rounded bg-gray-600 border-gray-500 text-amber-500 focus:ring-amber-500"
                    />
                    <div className="flex items-center gap-3 flex-1">
                      <div className="h-8 w-8 rounded-lg bg-gray-800 flex items-center justify-center text-xs font-bold text-amber-400">
                        {c.nomeAdega.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{c.nomeAdega}</p>
                        <p className="text-xs text-gray-500">{c.nome} · {c.email}</p>
                      </div>
                    </div>
                    {selectedClienteIds.has(c.id) && (
                      <Check size={16} className="text-amber-400 flex-shrink-0" />
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Info about Broadcast */}
        {modo === 'broadcast' && (
          <div className="mt-6 bg-blue-900/20 border border-blue-800/30 rounded-2xl p-6">
            <div className="flex items-start gap-3">
              <Info size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-400">Modo Broadcast</h4>
                <p className="text-sm text-blue-300/70 mt-1">
                  A notificação será enviada para <strong>todos os {clientes.length} clientes</strong>{' '}
                  cadastrados no sistema. Use com moderação para evitar spam.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
