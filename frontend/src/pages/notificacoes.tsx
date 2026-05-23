import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Bell,
  BellOff,
  CheckCheck,
  Trash2,
  Mail,
  AlertTriangle,
  Info,
  Gift,
  Megaphone,
  Clock,
  RefreshCw,
} from 'lucide-react';
import Layout from '@/components/Layout';
import Pagination from '@/components/Pagination';

const API = process.env.NEXT_PUBLIC_API_URL || '';

interface Notificacao {
  id: string;
  titulo: string;
  mensagem: string;
  tipo: 'info' | 'alerta' | 'promocao' | 'sistema' | 'fatura';
  lida: boolean;
  createdAt: string;
}

export default function Notificacoes() {
  const router = useRouter();
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<'todas' | 'nao-lidas' | 'lidas'>('todas');
  const [tipoFilter, setTipoFilter] = useState<string>('todos');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const naoLidas = notificacoes.filter((n) => !n.lida).length;

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    loadNotificacoes();
  }, [page, filter, tipoFilter]);

  const loadNotificacoes = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 20 };
      if (filter === 'nao-lidas') params.lida = false;
      if (filter === 'lidas') params.lida = true;
      if (tipoFilter !== 'todos') params.tipo = tipoFilter;

      const { data } = await axios.get(`${API}/api/notificacoes`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      setNotificacoes(data.data || data);
      setTotalPages(data.totalPages || Math.ceil((data.total || (data.data || data).length) / 20));
      setTotal(data.total || (data.data || data).length);
    } catch (err: any) {
      toast.error('Erro ao carregar notificações');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await axios.patch(
        `${API}/api/notificacoes/${id}/ler`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNotificacoes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, lida: true } : n))
      );
    } catch {
      toast.error('Erro ao marcar como lida');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await axios.post(
        `${API}/api/notificacoes/ler-todas`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
      toast.success('Todas marcadas como lidas!');
    } catch {
      toast.error('Erro ao marcar todas');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`${API}/api/notificacoes/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotificacoes((prev) => prev.filter((n) => n.id !== id));
      toast.success('Notificação removida');
    } catch {
      toast.error('Erro ao excluir');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Excluir ${selectedIds.size} notificação(ões)?`)) return;

    try {
      await axios.post(
        `${API}/api/notificacoes/excluir-varias`,
        { ids: Array.from(selectedIds) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNotificacoes((prev) => prev.filter((n) => !selectedIds.has(n.id)));
      setSelectedIds(new Set());
      toast.success(`${selectedIds.size} notificações excluídas`);
    } catch {
      toast.error('Erro ao excluir notificações');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === notificacoes.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(notificacoes.map((n) => n.id)));
    }
  };

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'alerta':
        return <AlertTriangle size={18} className="text-red-400" />;
      case 'promocao':
        return <Gift size={18} className="text-amber-400" />;
      case 'fatura':
        return <Mail size={18} className="text-blue-400" />;
      case 'sistema':
        return <Info size={18} className="text-purple-400" />;
      default:
        return <Megaphone size={18} className="text-gray-400" />;
    }
  };

  const getTipoBg = (tipo: string) => {
    switch (tipo) {
      case 'alerta':
        return 'bg-red-900/20';
      case 'promocao':
        return 'bg-amber-900/20';
      case 'fatura':
        return 'bg-blue-900/20';
      case 'sistema':
        return 'bg-purple-900/20';
      default:
        return 'bg-gray-800';
    }
  };

  const tipos = [
    { id: 'todos', label: 'Todos' },
    { id: 'info', label: 'Info' },
    { id: 'alerta', label: 'Alertas' },
    { id: 'promocao', label: 'Promoções' },
    { id: 'fatura', label: 'Faturas' },
    { id: 'sistema', label: 'Sistema' },
  ];

  return (
    <Layout title="Notificações">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bell size={24} className="text-amber-400" />
            {naoLidas > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {naoLidas}
              </span>
            )}
          </div>
          <div>
            <p className="text-sm text-gray-400">
              {total} notificação(ões) · {naoLidas} não lidas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadNotificacoes}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition"
            title="Atualizar"
          >
            <RefreshCw size={18} />
          </button>
          {naoLidas > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition"
            >
              <CheckCheck size={16} />
              Marcar todas lidas
            </button>
          )}
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg text-sm transition"
            >
              <Trash2 size={16} />
              Excluir ({selectedIds.size})
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          {[
            { id: 'todas', label: 'Todas' },
            { id: 'nao-lidas', label: 'Não lidas' },
            { id: 'lidas', label: 'Lidas' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as any)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                filter === f.id ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1 overflow-x-auto">
          {tipos.map((t) => (
            <button
              key={t.id}
              onClick={() => setTipoFilter(t.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
                tipoFilter === t.id ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-12 text-gray-500">
          <div className="animate-spin w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full mx-auto mb-3" />
          Carregando...
        </div>
      )}

      {/* Empty */}
      {!loading && notificacoes.length === 0 && (
        <div className="text-center py-16 bg-gray-800/50 rounded-2xl border border-dashed border-gray-700">
          <BellOff size={40} className="mx-auto text-gray-600 mb-3" />
          <h3 className="text-lg font-medium mb-1">Nenhuma notificação</h3>
          <p className="text-sm text-gray-500">
            {filter !== 'todas'
              ? 'Nenhuma notificação neste filtro'
              : 'Você não tem notificações no momento'}
          </p>
        </div>
      )}

      {/* List */}
      {!loading && notificacoes.length > 0 && (
        <>
          <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
            {/* Bulk select header */}
            <div className="px-4 py-2 bg-gray-800/50 border-b border-gray-700 flex items-center gap-3">
              <input
                type="checkbox"
                checked={selectedIds.size === notificacoes.length && notificacoes.length > 0}
                onChange={toggleSelectAll}
                className="rounded bg-gray-600 border-gray-500 text-amber-500 focus:ring-amber-500"
              />
              <span className="text-xs text-gray-500">
                {selectedIds.size > 0 ? `${selectedIds.size} selecionadas` : 'Selecionar todas'}
              </span>
            </div>

            <div className="divide-y divide-gray-700/50">
              {notificacoes.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-4 px-4 py-4 transition group hover:bg-gray-700/30 ${
                    !n.lida ? 'bg-gray-700/20' : ''
                  }`}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selectedIds.has(n.id)}
                    onChange={() => toggleSelect(n.id)}
                    className="mt-1 rounded bg-gray-600 border-gray-500 text-amber-500 focus:ring-amber-500"
                  />

                  {/* Icon */}
                  <div className={`p-2 rounded-lg flex-shrink-0 ${getTipoBg(n.tipo)}`}>
                    {getTipoIcon(n.tipo)}
                  </div>

                  {/* Content */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => !n.lida && handleMarkRead(n.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4
                          className={`text-sm ${!n.lida ? 'font-semibold text-white' : 'text-gray-300'}`}
                        >
                          {n.titulo}
                          {!n.lida && (
                            <span className="inline-block w-2 h-2 bg-amber-400 rounded-full ml-2" />
                          )}
                        </h4>
                        <p className="text-sm text-gray-400 mt-1">{n.mensagem}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="flex items-center gap-1 text-xs text-gray-600">
                        <Clock size={12} />
                        {new Date(n.createdAt).toLocaleString('pt-BR')}
                      </span>
                      <span className="text-xs text-gray-700 capitalize">{n.tipo}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    {!n.lida && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        className="p-1.5 text-gray-500 hover:text-amber-400 hover:bg-gray-700 rounded-lg transition"
                        title="Marcar como lida"
                      >
                        <CheckCheck size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(n.id)}
                      className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded-lg transition"
                      title="Excluir"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            total={total}
            perPage={20}
          />
        </>
      )}
    </Layout>
  );
}
