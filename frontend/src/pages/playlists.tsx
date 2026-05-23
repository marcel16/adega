import { useState, useEffect, DragEvent } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Plus,
  Trash2,
  GripVertical,
  Save,
  Play,
  Pause,
  Shuffle,
  Film,
  Image,
  Youtube,
  Megaphone,
  ChevronUp,
  ChevronDown,
  Clock,
} from 'lucide-react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';

const API = process.env.NEXT_PUBLIC_API_URL || '';

interface PlaylistItem {
  id: string;
  ordem: number;
  tipo: 'midia' | 'promocao';
  midia?: any;
  promocao?: any;
  duracaoPersonalizada?: number;
}

interface Playlist {
  id: string;
  nome: string;
  ativa: boolean;
  itens: PlaylistItem[];
  createdAt: string;
}

export default function Playlists() {
  const router = useRouter();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [availableMidias, setAvailableMidias] = useState<any[]>([]);
  const [availablePromocoes, setAvailablePromocoes] = useState<any[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [novaPlaylist, setNovaPlaylist] = useState('');
  const [addTab, setAddTab] = useState<'midias' | 'promocoes'>('midias');

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const selected = playlists.find((p) => p.id === selectedId);

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    loadPlaylists();
    loadAvailableMidias();
    loadAvailablePromocoes();
  }, []);

  const loadPlaylists = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/playlists`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const list = data.data || data;
      setPlaylists(list);
      if (list.length > 0 && !selectedId) {
        setSelectedId(list[0].id);
      }
    } catch (err: any) {
      toast.error('Erro ao carregar playlists');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableMidias = async () => {
    try {
      const { data } = await axios.get(`${API}/api/midias`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 100 },
      });
      setAvailableMidias(data.data || data);
    } catch {}
  };

  const loadAvailablePromocoes = async () => {
    try {
      const { data } = await axios.get(`${API}/api/promocoes`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 100 },
      });
      setAvailablePromocoes(data.data || data);
    } catch {}
  };

  const handleCreatePlaylist = async () => {
    if (!novaPlaylist.trim()) return;
    try {
      const { data } = await axios.post(
        `${API}/api/playlists`,
        { nome: novaPlaylist.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Playlist criada!');
      setCreateModalOpen(false);
      setNovaPlaylist('');
      await loadPlaylists();
      setSelectedId(data.id);
    } catch {
      toast.error('Erro ao criar playlist');
    }
  };

  const handleDeletePlaylist = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta playlist?')) return;
    try {
      await axios.delete(`${API}/api/playlists/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Playlist excluída!');
      if (selectedId === id) setSelectedId(null);
      loadPlaylists();
    } catch {
      toast.error('Erro ao excluir playlist');
    }
  };

  const handleAddItem = async (tipo: 'midia' | 'promocao', item: any) => {
    if (!selectedId) return;
    try {
      await axios.post(
        `${API}/api/playlists/${selectedId}/itens`,
        {
          tipo,
          [`${tipo}Id`]: item.id,
          ordem: selected?.itens.length || 0,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Item adicionado!');
      setAddModalOpen(false);
      loadPlaylists();
    } catch {
      toast.error('Erro ao adicionar item');
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!selectedId) return;
    try {
      await axios.delete(`${API}/api/playlists/${selectedId}/itens/${itemId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Item removido!');
      loadPlaylists();
    } catch {
      toast.error('Erro ao remover item');
    }
  };

  const handleSaveOrder = async () => {
    if (!selectedId || !selected) return;
    setSaving(true);
    try {
      const ordem = selected.itens.map((item, i) => ({
        id: item.id,
        ordem: i,
      }));
      await axios.put(
        `${API}/api/playlists/${selectedId}/reorder`,
        { ordem },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Ordem salva!');
    } catch {
      toast.error('Erro ao salvar ordem');
    } finally {
      setSaving(false);
    }
  };

  const moveItem = (fromIndex: number, direction: 'up' | 'down') => {
    if (!selectedId || !selected) return;
    const updated = [...selected.itens];
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= updated.length) return;

    [updated[fromIndex], updated[toIndex]] = [updated[toIndex], updated[fromIndex]];
    const reordered = updated.map((item, i) => ({ ...item, ordem: i }));
    setPlaylists(
      playlists.map((p) => (p.id === selectedId ? { ...p, itens: reordered } : p))
    );
  };

  // Drag & Drop
  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;

    if (!selectedId || !selected) return;
    const updated = [...selected.itens];
    const draggedItem = updated[dragIndex];
    updated.splice(dragIndex, 1);
    updated.splice(index, 0, draggedItem);

    const reordered = updated.map((item, i) => ({ ...item, ordem: i }));
    setPlaylists(
      playlists.map((p) => (p.id === selectedId ? { ...p, itens: reordered } : p))
    );
    setDragIndex(index);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  const getItemIcon = (item: PlaylistItem) => {
    if (item.tipo === 'promocao') return <Megaphone size={16} className="text-amber-400" />;
    if (item.midia?.tipo === 'youtube') return <Youtube size={16} className="text-red-400" />;
    if (item.midia?.tipo === 'imagem') return <Image size={16} className="text-blue-400" />;
    return <Film size={16} className="text-purple-400" />;
  };

  const getItemTitle = (item: PlaylistItem) => {
    if (item.tipo === 'promocao') return item.promocao?.titulo || 'Promoção';
    return item.midia?.titulo || 'Mídia';
  };

  const getItemSubtitle = (item: PlaylistItem) => {
    if (item.tipo === 'promocao') return `Promoção · ${item.promocao?.duracao || '?'}s`;
    if (item.midia?.tipo === 'youtube') return 'YouTube';
    return `Mídia · ${item.midia?.tipo || '?'}`;
  };

  return (
    <Layout title="Playlists">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar: Playlist list */}
        <div className="lg:w-72 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Playlists
            </h3>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="text-amber-400 hover:text-amber-300 p-1"
              title="Nova playlist"
            >
              <Plus size={18} />
            </button>
          </div>

          <div className="space-y-1">
            {playlists.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition flex items-center justify-between group ${
                  selectedId === p.id
                    ? 'bg-amber-600/20 border border-amber-600/30 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800 border border-transparent'
                }`}
              >
                <span className="truncate">{p.nome}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  <span className="text-xs text-gray-600">{p.itens.length}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePlaylist(p.id);
                    }}
                    className="text-gray-600 hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </button>
            ))}
          </div>

          {/* Empty */}
          {playlists.length === 0 && !loading && (
            <div className="text-center py-8 text-gray-600">
              <p className="text-sm">Nenhuma playlist</p>
              <button
                onClick={() => setCreateModalOpen(true)}
                className="text-amber-500 hover:text-amber-400 text-sm mt-2"
              >
                Criar primeira
              </button>
            </div>
          )}
        </div>

        {/* Main: Playlist editor */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Carregando...</div>
          ) : !selected ? (
            <div className="text-center py-16 bg-gray-800/50 rounded-2xl border border-dashed border-gray-700">
              <p className="text-4xl mb-3">🎬</p>
              <h3 className="text-lg font-medium mb-1">Selecione uma playlist</h3>
              <p className="text-sm text-gray-500">Escolha uma playlist à esquerda para editar</p>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold">{selected.nome}</h2>
                  <p className="text-sm text-gray-500">{selected.itens.length} itens</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAddModalOpen(true)}
                    className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 px-3 py-2 rounded-lg text-sm font-medium transition"
                  >
                    <Plus size={16} />
                    Adicionar Item
                  </button>
                  <button
                    onClick={handleSaveOrder}
                    disabled={saving}
                    className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 px-3 py-2 rounded-lg text-sm transition"
                  >
                    <Save size={16} />
                    {saving ? 'Salvando...' : 'Salvar Ordem'}
                  </button>
                </div>
              </div>

              {/* Items */}
              {selected.itens.length === 0 ? (
                <div className="text-center py-16 bg-gray-800/50 rounded-2xl border border-dashed border-gray-700">
                  <p className="text-4xl mb-3">📋</p>
                  <h3 className="text-lg font-medium mb-1">Playlist vazia</h3>
                  <p className="text-sm text-gray-500 mb-4">Adicione mídias e promoções</p>
                  <button
                    onClick={() => setAddModalOpen(true)}
                    className="bg-amber-600 hover:bg-amber-500 px-4 py-2 rounded-lg text-sm font-medium transition"
                  >
                    Adicionar Item
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {selected.itens
                    .sort((a, b) => a.ordem - b.ordem)
                    .map((item, index) => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        className={`flex items-center gap-3 bg-gray-800 rounded-xl p-3 border transition cursor-grab active:cursor-grabbing ${
                          dragIndex === index
                            ? 'border-amber-400 bg-amber-400/5 scale-[1.02] shadow-lg'
                            : 'border-gray-700 hover:border-gray-600'
                        }`}
                      >
                        {/* Order number */}
                        <span className="text-xs text-gray-600 w-6 text-center font-mono">
                          {index + 1}
                        </span>

                        {/* Drag handle */}
                        <GripVertical size={16} className="text-gray-600 flex-shrink-0" />

                        {/* Item icon */}
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center">
                          {getItemIcon(item)}
                        </div>

                        {/* Item info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {getItemTitle(item)}
                          </p>
                          <p className="text-xs text-gray-500">{getItemSubtitle(item)}</p>
                        </div>

                        {/* Duration */}
                        <div className="flex items-center gap-1 text-xs text-gray-600">
                          <Clock size={12} />
                          {item.duracaoPersonalizada ||
                            item.promocao?.duracao ||
                            item.midia?.duracao ||
                            'auto'}
                          s
                        </div>

                        {/* Move buttons */}
                        <div className="flex flex-col">
                          <button
                            onClick={() => moveItem(index, 'up')}
                            disabled={index === 0}
                            className="text-gray-600 hover:text-white disabled:opacity-30 p-0.5"
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            onClick={() => moveItem(index, 'down')}
                            disabled={index === selected.itens.length - 1}
                            className="text-gray-600 hover:text-white disabled:opacity-30 p-0.5"
                          >
                            <ChevronDown size={14} />
                          </button>
                        </div>

                        {/* Remove */}
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-gray-600 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-900/20 transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal: Create playlist */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Nova Playlist"
      >
        <div className="space-y-4">
          <input
            type="text"
            value={novaPlaylist}
            onChange={(e) => setNovaPlaylist(e.target.value)}
            className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
            placeholder="Nome da playlist"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
          />
          <div className="flex gap-3">
            <button
              onClick={() => setCreateModalOpen(false)}
              className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreatePlaylist}
              className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium transition"
            >
              Criar
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Add items */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Adicionar Item"
        size="lg"
      >
        <div className="flex gap-1 mb-4 bg-gray-700 rounded-lg p-1">
          <button
            onClick={() => setAddTab('midias')}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${
              addTab === 'midias' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            🎬 Mídias
          </button>
          <button
            onClick={() => setAddTab('promocoes')}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${
              addTab === 'promocoes' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            📢 Promoções
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto space-y-1">
          {addTab === 'midias'
            ? availableMidias.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleAddItem('midia', m)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-gray-700 transition text-sm"
                >
                  {m.tipo === 'youtube' ? (
                    <Youtube size={18} className="text-red-400 flex-shrink-0" />
                  ) : m.tipo === 'imagem' ? (
                    <Image size={18} className="text-blue-400 flex-shrink-0" />
                  ) : (
                    <Film size={18} className="text-purple-400 flex-shrink-0" />
                  )}
                  <span className="text-white truncate">{m.titulo}</span>
                  <span className="text-xs text-gray-500 ml-auto">
                    {m.tipo === 'youtube' ? 'YT' : m.tipo}
                  </span>
                  <Plus size={16} className="text-gray-600" />
                </button>
              ))
            : availablePromocoes.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleAddItem('promocao', p)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-gray-700 transition text-sm"
                >
                  <Megaphone size={18} className="text-amber-400 flex-shrink-0" />
                  <span className="text-white truncate">{p.titulo}</span>
                  <span className="text-xs text-gray-500 ml-auto">{p.duracao}s</span>
                  <Plus size={16} className="text-gray-600" />
                </button>
              ))}
        </div>

        {((addTab === 'midias' && availableMidias.length === 0) ||
          (addTab === 'promocoes' && availablePromocoes.length === 0)) && (
          <p className="text-center text-gray-500 text-sm py-6">
            Nenhum item disponível. Crie {addTab === 'midias' ? 'mídias' : 'promoções'} primeiro.
          </p>
        )}
      </Modal>
    </Layout>
  );
}
