import { useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import toast from 'react-hot-toast';

const API = process.env.NEXT_PUBLIC_API_URL || '';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [modo, setModo] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ nome: '', nomeAdega: '' });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/auth/login`, { email, senha });
      localStorage.setItem('token', data.token);
      localStorage.setItem('cliente', JSON.stringify(data.cliente));
      toast.success('Login realizado!');
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/auth/register`, {
        ...form,
        email,
        senha,
      });
      localStorage.setItem('token', data.token);
      localStorage.setItem('cliente', JSON.stringify(data.cliente));
      toast.success('Conta criada com sucesso!');
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao criar conta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-red-900 to-amber-900 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 w-full max-w-md border border-white/20">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">🍷 Adega</h1>
          <p className="text-white/70 mt-2">Sistema de Gestão de TVs</p>
        </div>

        <div className="flex mb-6 bg-white/10 rounded-lg p-1">
          <button
            onClick={() => setModo('login')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition ${modo === 'login' ? 'bg-white/20 text-white' : 'text-white/50'}`}
          >
            Entrar
          </button>
          <button
            onClick={() => setModo('register')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition ${modo === 'register' ? 'bg-white/20 text-white' : 'text-white/50'}`}
          >
            Criar Conta
          </button>
        </div>

        <form onSubmit={modo === 'login' ? handleLogin : handleRegister} className="space-y-4">
          {modo === 'register' && (
            <>
              <input
                type="text"
                placeholder="Seu nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-amber-400"
                required
              />
              <input
                type="text"
                placeholder="Nome da Adega"
                value={form.nomeAdega}
                onChange={(e) => setForm({ ...form, nomeAdega: e.target.value })}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-amber-400"
                required
              />
            </>
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-amber-400"
            required
          />
          <input
            type="password"
            placeholder="Senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-amber-400"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-700 text-black font-bold rounded-lg transition"
          >
            {loading ? 'Carregando...' : modo === 'login' ? 'Entrar' : 'Criar Conta'}
          </button>
        </form>
      </div>
    </div>
  );
}
