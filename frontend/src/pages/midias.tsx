import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Plus, Trash2, Youtube, Upload as UploadIcon, Film, Image, Copy, Search } from 'lucide-react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import FileUpload from '@/components/FileUpload';
import Pagination from '@/components/Pagination';

const API = process.env.NEXT_PUBLIC_API_URL || '';

interface Midia {
  id: string;
  titulo: string;
  tipo: 'video' | 'imagem' | 'youtube';
  url: string;
  youtubeId?: string;
  duracao?: number;
  tamanho?: number;
  thumbnail?: string;
  createdAt: string;
}

export default function Midias() {
  const router = useRouter();
  const [midias, setMidias] = useState<Midia[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'upload' | 'youtube'>('upload');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<'todos' | 'video' | 'imagem' | 'youtube'>('todos');
  const [search, setSearch] = useState('');

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [titulo, setTitulo] = useState('');
  const [uploading, setUploading] = useState(false);

  // YouTube state
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeTitulo, setYoutubeTitulo] = useState('');
  const [importing, setImporting] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    loadMidias();
  }, [page, filter]);

  const loadMidias = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 12 };
      if (filter !== 'todos') params.tipo = filter;
      if (search) params.search = search;

      const { data } = await axios.get(`${API}/api/midias`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      setMidias(data.data || data);
      setTotalPages(data.totalPages || Math.ceil((data.total || (data.data || data).length) / 10));
      setTotal(data.total || (data.data || data).length);
    } catch (err: any) {
      toast.error('Erro ao carregar mídias');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error('Selecione um arquivo');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('titulo', titulo || file.name);

      await axios.post(`${API}/api/midias/upload`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      toast.success('Mídia enviada com sucesso!');
      setModalOpen(false);
      setFile(null);
      setTitulo('');
      loadMidias();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao enviar mídia');
    } finally {
      setUploading(false);
    }
  };

  const handleYoutubeImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrl) {
      toast.error('Informe a URL do YouTube');
      return;
    }
    setImporting(true);
    try {
      await axios.post(
        `${API}/api/midias/youtube`,
        { url: youtubeUrl, titulo: youtubeTitulo },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Vídeo importado do YouTube!');
      setModalOpen(false);
      setYoutubeUrl('');
      setYoutubeTitulo('');
      loadMidias();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao importar vídeo');
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta mídia?')) return;
    try {
      await axios.delete(`${API}/api/midias/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Mídia excluída!');
      loadMidias();
    } catch {
      toast.error('Erro ao excluir mídia');
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('URL copiada!');
  };

  const openUploadModal = () => {
    setModalMode('upload');
    setFile(null);
    setTitulo('');
    setModalOpen(true);
  };

  const openYoutubeModal = () => {
    setModalMode('youtube');
    setYoutubeUrl('');
    setYoutubeTitulo('');
    setModalOpen(true);
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const getYoutubeThumb = (youtubeId?: string) =>
    youtubeId ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg` : null;

  const filters = [
    { id: 'todos', label: 'Todos' },
    { id: 'video', label: '🎬 Vídeos' },
    { id: 'imagem', label: '🖼️ Imagens' },
    { id: 'youtube', label: '▶️ YouTube' },
  ];

  return (
    <Layout title="Mídias">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-sm text-gray-400">
            {total} mídia(s) · {formatSize(midias.reduce((acc, m) => acc + (m.tamanho || 0), 0))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openUploadModal}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 px-4 py-2.5 rounded-lg text-sm font-medium transition"
          >
            <UploadIcon size={18} />
            Upload
          </button>
          <button
            onClick={openYoutubeModal}
            className="flex items-center gap-2 bg-red-700 hover:bg-red-600 px-4 py-2.5 rounded-lg text-sm font-medium transition"
          >
            <Youtube size={18} />
            YouTube
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          {filters.map((f) => (
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
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadMidias()}
            placeholder="Buscar mídias..."
            className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
          />
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
      {!loading && midias.length === 0 && (
        <div className="text-center py-16 bg-gray-800/50 rounded-2xl border border-dashed border-gray-700">
          <p className="text-4xl mb-3">🎬</p>
          <h3 className="text-lg font-medium mb-1">Nenhuma mídia encontrada</h3>
          <p className="text-sm text-gray-500 mb-4">Faça upload de vídeos, imagens ou importe do YouTube</p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={openUploadModal}
              className="bg-amber-600 hover:bg-amber-500 px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              Fazer Upload
            </button>
            <button
              onClick={openYoutubeModal}
              className="bg-red-700 hover:bg-red-600 px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              Importar do YouTube
            </button>
          </div>
        </div>
      )}

      {/* Grid */}
      {!loading && midias.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {midias.map((m) => (
              <div
                key={m.id}
                className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden group hover:border-gray-600 transition"
              >
                {/* Thumbnail */}
                <div className="aspect-video bg-gray-900 relative overflow-hidden">
                  {m.tipo === 'youtube' && m.youtubeId ? (
                    <img
                      src={getYoutubeThumb(m.youtubeId)!}
                      alt={m.titulo}
                      className="w-full h-full object-cover"
                    />
                  ) : m.tipo === 'imagem' ? (
                    <img src={m.url} alt={m.titulo} className="w-full h-full object-cover" />
                  ) : m.tipo === 'video' ? (
                    <video src={m.url} className="w-full h-full object-cover" muted />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600">
                      {m.tipo === 'youtube' ? <Youtube size={32} /> : <Film size={32} />}
                    </div>
                  )}

                  {/* YouTube badge */}
                  {m.tipo === 'youtube' && (
                    <div className="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                      YT
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                    <button
                      onClick={() => window.open(m.url, '_blank')}
                      className="bg-white/20 hover:bg-white/30 p-2 rounded-full transition"
                      title="Visualizar"
                    >
                      <Film size={16} className="text-white" />
                    </button>
                    <button
                      onClick={() => copyUrl(m.url)}
                      className="bg-white/20 hover:bg-white/30 p-2 rounded-full transition"
                      title="Copiar URL"
                    >
                      <Copy size={16} className="text-white" />
                    </button>
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="bg-white/20 hover:bg-red-500/50 p-2 rounded-full transition"
                      title="Excluir"
                    >
                      <Trash2 size={16} className="text-white" />
                    </button>
                  </div>
                </div>

                {/* Info */}
                <div className="p-3">
                  <p className="text-sm font-medium text-white truncate">{m.titulo}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">
                      {m.tipo === 'video' && '🎬 Vídeo'}
                      {m.tipo === 'imagem' && '🖼️ Imagem'}
                      {m.tipo === 'youtube' && '▶️ YouTube'}
                    </span>
                    {m.tamanho && <span className="text-xs text-gray-600">{formatSize(m.tamanho)}</span>}
                    {m.duracao && <span className="text-xs text-gray-600">{m.duracao}s</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            total={total}
            perPage={12}
          />
        </>
      )}

      {/* Modal: Upload */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalMode === 'upload' ? 'Upload de Mídia' : 'Importar do YouTube'}
        size="lg"
      >
        {modalMode === 'upload' ? (
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Título</label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
                placeholder="Nome do arquivo (opcional)"
              />
            </div>

            <FileUpload
              accept="video/*,image/*"
              maxSizeMB={200}
              value={file}
              onChange={(f) => setFile(f as File | null)}
              label="Selecione um vídeo ou imagem"
            />

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={uploading || !file}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 rounded-lg text-sm font-medium transition"
              >
                {uploading ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleYoutubeImport} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">URL do YouTube *</label>
              <input
                type="url"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
                placeholder="https://www.youtube.com/watch?v=..."
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Cole o link de um vídeo público do YouTube
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Título (opcional)</label>
              <input
                type="text"
                value={youtubeTitulo}
                onChange={(e) => setYoutubeTitulo(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
                placeholder="Título personalizado para o vídeo"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={importing || !youtubeUrl}
                className="flex-1 py-2.5 bg-red-700 hover:bg-red-600 disabled:bg-red-900 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
              >
                <Youtube size={16} />
                {importing ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </Layout>
  );
}
