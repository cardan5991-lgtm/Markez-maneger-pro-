import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, 
  ClipboardList, 
  Wallet, 
  Settings, 
  Plus, 
  LogOut, 
  Menu, 
  X, 
  Bell,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronRight,
  Download,
  Upload,
  RefreshCw,
  Smartphone,
  MessageCircle,
  Image as ImageIcon,
  Trash2,
  Lock,
  Check,
  Sparkles,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from '@google/genai';
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from './lib/utils';
import { 
  DashboardView, 
  OrdersView, 
  FinancesView, 
  SettingsView 
} from './components/Views';
import { PostCreatorModal } from './components/PostCreatorModal';

// --- Types ---
type Tab = 'dashboard' | 'orders' | 'finances' | 'settings';

interface Order {
  id: number;
  customer_name: string;
  phone: string;
  address: string;
  registration_date: string;
  delivery_date: string;
  material: string;
  work_type: string;
  total: number;
  advance: number;
  status: 'pending' | 'completed' | 'cancelled';
}

interface Transaction {
  id: number;
  date: string;
  concept: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  order_id?: number;
}

interface Profile {
  business_name: string;
  address: string;
  phone: string;
  logo_url: string;
  whatsapp_template: string;
  use_whatsapp_business: boolean;
}

// --- Main App ---
export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isPostCreatorOpen, setIsPostCreatorOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [profile, setProfile] = useState<Profile>({
    business_name: 'Markez Tapicería',
    address: '',
    phone: '',
    logo_url: '',
    whatsapp_template: '',
    use_whatsapp_business: false
  });
  const [limits, setLimits] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [insights, setInsights] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCompletedOrders, setShowCompletedOrders] = useState(false);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<Order | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<number | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [selectedTheme, setSelectedTheme] = useState('default');
  const [confirmationModal, setConfirmationModal] = useState<any>({ isOpen: false, title: '', message: '', onConfirm: () => {}, confirmText: '', cancelText: '', type: 'primary' });
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [passwordPrompt, setPasswordPrompt] = useState<any>({ isOpen: false, action: '', passwordInput: '', newPasswordInput: '' });
  const [orderToDelete, setOrderToDelete] = useState<number | null>(null);
  const [paymentModal, setPaymentModal] = useState<{ isOpen: boolean, orderId: number | null, amount: string }>({ isOpen: false, orderId: null, amount: '' });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- API Calls ---
  useEffect(() => {
    document.body.className = '';
    if (!isDarkMode) document.body.classList.add('light-mode');
    if (selectedTheme === 'blue') document.body.classList.add('theme-blue');
    if (selectedTheme === 'leather') document.body.classList.add('theme-leather');
  }, [isDarkMode, selectedTheme]);

  const safeFetch = async (url: string, options?: RequestInit) => {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `Error: ${res.status}`);
      }
      return await res.json();
    } catch (err: any) {
      console.error(`Fetch error (${url}):`, err);
      setToast({ message: err.message || 'Error de conexión', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      throw err;
    }
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [ordersData, transData, profileData, limitsData] = await Promise.all([
        safeFetch('/api/orders'),
        safeFetch('/api/transactions'),
        safeFetch('/api/profile'),
        safeFetch('/api/limits')
      ]);
      setOrders(ordersData);
      setTransactions(transData);
      setProfile(profileData);
      setLimits(limitsData);
    } catch (err) {
      // Error handled in safeFetch
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const savedLogin = localStorage.getItem('markez_logged_in');
    if (savedLogin === 'true') {
      setIsLoggedIn(true);
      fetchData();
    } else {
      setIsLoading(false);
    }
  }, [fetchData]);

  // Listen for custom events
  useEffect(() => {
    const handleOpenPostCreator = () => setIsPostCreatorOpen(true);
    window.addEventListener('open-post-creator', handleOpenPostCreator);
    return () => window.removeEventListener('open-post-creator', handleOpenPostCreator);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await safeFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });
      if (res.success) {
        setIsLoggedIn(true);
        localStorage.setItem('markez_logged_in', 'true');
        fetchData();
      }
    } catch (err) {
      // Error handled in safeFetch
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('markez_logged_in');
  };

  const generateInsights = useCallback(async () => {
    if (transactions.length === 0) return;
    setIsGeneratingInsights(true);
    try {
      const configRes = await fetch("/api/config/gemini");
      const configData = await configRes.json();
      const apiKey = configData.apiKey;

      if (!apiKey || apiKey === "undefined" || apiKey === "null" || apiKey.trim() === "") {
        setInsights("La Inteligencia Artificial no está disponible en este momento (Falta configuración).");
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      const recentTrans = transactions.slice(0, 20).map(t => `${t.date}: ${t.concept} (${t.type === 'income' ? '+' : '-'}${t.amount})`).join('\n');
      
      const prompt = `Actúa como un consultor financiero experto para una tapicería. 
      Analiza estas transacciones recientes y da 3 consejos breves y accionables para mejorar la rentabilidad. 
      Sé directo y profesional. Usa un tono motivador.
      
      Transacciones:
      ${recentTrans}`;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      
      setInsights(result.text || "No se pudo generar el análisis.");
    } catch (err) {
      console.error("Error generating insights:", err);
      setInsights("Error al conectar con la IA. Intenta más tarde.");
    } finally {
      setIsGeneratingInsights(false);
    }
  }, [transactions]);

  useEffect(() => {
    if (isLoggedIn && transactions.length > 0 && !insights) {
      generateInsights();
    }
  }, [isLoggedIn, transactions.length, insights, generateInsights]);

  // --- Computed Data ---
  const financeStats = useMemo(() => {
    const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);
    return { income, expense };
  }, [transactions]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchesSearch = o.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            o.phone.includes(searchTerm);
      const matchesStatus = showCompletedOrders ? o.status === 'completed' : o.status === 'pending';
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, showCompletedOrders]);

  const capacityWarnings = useMemo(() => {
    const pendingByWork = orders.filter(o => o.status === 'pending').reduce((acc: any, o) => {
      acc[o.work_type] = (acc[o.work_type] || 0) + 1;
      return acc;
    }, {});

    return limits.map(l => ({
      type: l.work_type,
      current: pendingByWork[l.work_type] || 0,
      limit: l.limit_val,
      percentage: ((pendingByWork[l.work_type] || 0) / l.limit_val) * 100
    })).filter(w => w.percentage >= 80);
  }, [orders, limits]);

  const getMonthlyData = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const date = subMonths(new Date(), i);
      return {
        name: format(date, 'MMM', { locale: es }),
        month: date.getMonth(),
        year: date.getFullYear(),
        income: 0,
        expense: 0
      };
    }).reverse();

    transactions.forEach(t => {
      const tDate = new Date(t.date);
      const monthData = months.find(m => m.month === tDate.getMonth() && m.year === tDate.getFullYear());
      if (monthData) {
        if (t.type === 'income') monthData.income += Number(t.amount);
        else monthData.expense += Number(t.amount);
      }
    });

    return months;
  }, [transactions]);

  const getCategoryData = useMemo(() => {
    const cats: any = {};
    transactions.filter(t => t.type === 'expense').forEach(t => {
      cats[t.category] = (cats[t.category] || 0) + Number(t.amount);
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value: Number(value) }));
  }, [transactions]);

  // --- Handlers ---
  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(formData.entries());
    
    try {
      await safeFetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          total: Number(data.total),
          advance: Number(data.advance)
        })
      });
      setIsOrderModalOpen(false);
      fetchData();
      setToast({ message: 'Pedido creado con éxito', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err) { /* Handled */ }
  };

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(formData.entries());
    
    try {
      await safeFetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          amount: Number(data.amount)
        })
      });
      setIsTransactionModalOpen(false);
      fetchData();
      setToast({ message: 'Transacción registrada', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err) { /* Handled */ }
  };

  const handleCompleteOrder = async (id: number) => {
    try {
      await safeFetch(`/api/orders/${id}/complete`, { method: 'POST' });
      setSelectedOrderDetails(null);
      fetchData();
      setToast({ message: 'Pedido completado y liquidado', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err) { /* Handled */ }
  };

  const handleDeleteOrder = async () => {
    if (!orderToDelete) return;
    try {
      await safeFetch(`/api/orders/${orderToDelete}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordPrompt.passwordInput })
      });
      setOrderToDelete(null);
      setPasswordPrompt({ isOpen: false, action: '', passwordInput: '', newPasswordInput: '' });
      setSelectedOrderDetails(null);
      fetchData();
      setToast({ message: 'Pedido eliminado', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err) { /* Handled */ }
  };

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModal.orderId) return;
    try {
      await safeFetch(`/api/orders/${paymentModal.orderId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(paymentModal.amount) })
      });
      setPaymentModal({ isOpen: false, orderId: null, amount: '' });
      setSelectedOrderDetails(null);
      fetchData();
      setToast({ message: 'Abono registrado con éxito', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err) { /* Handled */ }
  };

  const handleExportJSON = () => {
    const data = {
      orders,
      transactions,
      profile,
      customLimits: limits.reduce((acc, l) => ({ ...acc, [l.work_type]: l.limit_val }), {}),
      exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `markez_respaldo_${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
  };

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      await safeFetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      fetchData();
      setToast({ message: 'Datos restaurados correctamente', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      setToast({ message: 'Error al importar archivo: ' + err.message, type: 'error' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleChangePassword = async () => {
    try {
      await safeFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          oldPassword: passwordPrompt.passwordInput, 
          newPassword: passwordPrompt.newPasswordInput 
        })
      });
      setPasswordPrompt({ isOpen: false, action: '', passwordInput: '', newPasswordInput: '' });
      setToast({ message: 'Contraseña actualizada', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err) { /* Handled */ }
  };

  const handleExportData = () => {
    // Export orders to CSV
    const headers = ['ID', 'Cliente', 'Teléfono', 'Dirección', 'Registro', 'Entrega', 'Material', 'Tipo', 'Total', 'Anticipo', 'Estado'];
    const rows = orders.map(o => [
      o.id,
      o.customer_name,
      o.phone,
      o.address,
      o.registration_date,
      o.delivery_date,
      o.material,
      o.work_type,
      o.total,
      o.advance,
      o.status
    ]);
    
    let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `pedidos_markez_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const forceUpdateApp = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
          registration.unregister();
        }
      });
    }
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };

  const showConfirmation = (config: any) => {
    setConfirmationModal({ ...config, isOpen: true });
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md card space-y-8"
        >
          <div className="text-center space-y-2">
            <div className="w-20 h-20 bg-primary rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-primary/20 mb-6">
              <Lock className="text-white" size={40} />
            </div>
            <h1 className="text-3xl font-black tracking-tighter">MARKEZ MANAGER</h1>
            <p className="text-gray-500 font-medium">Panel de Control de Tapicería</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Usuario</label>
              <input 
                type="text" 
                required
                className="input-field w-full" 
                placeholder="admin"
                value={loginForm.username}
                onChange={e => setLoginForm({...loginForm, username: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Contraseña</label>
              <input 
                type="password" 
                required
                className="input-field w-full" 
                placeholder="••••••••"
                value={loginForm.password}
                onChange={e => setLoginForm({...loginForm, password: e.target.value})}
              />
            </div>
            <button type="submit" className="btn-primary w-full py-4 text-lg">
              Iniciar Sesión
            </button>
          </form>
          
          <p className="text-center text-[10px] text-gray-600 uppercase font-black tracking-widest">
            Markez Pro v2.5 • 2024
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans selection:bg-primary/30">
      {/* Sidebar Desktop / Bottom Nav Mobile */}
      <aside className={cn(
        "fixed z-40 transition-all duration-500 ease-in-out bg-[#111111] border-white/5",
        "bottom-0 left-0 w-full h-16 border-t flex flex-row items-center justify-around px-2 md:px-0",
        "md:top-0 md:h-full md:border-r md:border-t-0 md:flex-col md:justify-start",
        isSidebarOpen ? "md:w-64" : "md:w-20"
      )}>
        <div className="flex md:flex-col h-full w-full md:w-auto md:p-6 items-center md:items-stretch justify-around md:justify-start">
          <div className="hidden md:flex items-center gap-4 mb-12 overflow-hidden">
            <div className="w-8 h-8 bg-primary rounded-lg shrink-0 flex items-center justify-center shadow-lg shadow-primary/20">
              <Smartphone className="text-white" size={18} />
            </div>
            <span className={cn("font-black tracking-tighter text-xl transition-opacity duration-300", isSidebarOpen ? "opacity-100" : "opacity-0")}>
              MARKEZ
            </span>
          </div>

          <nav className="flex flex-row md:flex-col flex-1 md:space-y-2 gap-2 md:gap-0 justify-around md:justify-start w-full md:w-auto">
            {[
              { id: 'dashboard', icon: LayoutDashboard, label: 'Panel' },
              { id: 'orders', icon: ClipboardList, label: 'Pedidos' },
              { id: 'finances', icon: Wallet, label: 'Finanzas' },
              { id: 'settings', icon: Settings, label: 'Ajustes' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as Tab)}
                className={cn(
                  "flex items-center justify-center md:justify-start gap-4 p-3 rounded-xl transition-all duration-300 group relative",
                  "w-auto md:w-full",
                  activeTab === item.id ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-gray-500 hover:bg-white/5 hover:text-white"
                )}
              >
                <item.icon size={22} className="shrink-0" />
                <span className={cn("hidden md:inline font-bold text-sm transition-all duration-300", isSidebarOpen ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4 pointer-events-none")}>
                  {item.label}
                </span>
                {!isSidebarOpen && (
                  <div className="hidden md:block absolute left-full ml-4 px-2 py-1 bg-primary text-white text-[10px] font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                    {item.label}
                  </div>
                )}
              </button>
            ))}
          </nav>

          <div className="hidden md:block pt-6 border-t border-white/5">
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-4 p-3 rounded-xl text-gray-500 hover:bg-rose-500/10 hover:text-rose-500 transition-all group"
            >
              <LogOut size={22} className="shrink-0" />
              <span className={cn("font-bold text-sm transition-all duration-300", isSidebarOpen ? "opacity-100" : "opacity-0")}>
                Salir
              </span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "transition-all duration-500 ease-in-out min-h-screen pb-20 md:pb-0",
        isSidebarOpen ? "md:pl-64" : "md:pl-20"
      )}>
        {/* Header */}
        <header className="sticky top-0 z-30 bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-white/5 px-4 md:px-8 py-4">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="hidden md:block p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
              >
                {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
              <div>
                <h2 className="text-xl font-black tracking-tight capitalize">
                  {activeTab === 'dashboard' ? 'Panel de Control' : 
                   activeTab === 'orders' ? 'Gestión de Pedidos' :
                   activeTab === 'finances' ? 'Control Financiero' :
                   'Configuración'}
                </h2>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                  {format(new Date(), "EEEE, d 'de' MMMM", { locale: es })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-4">
              <button 
                onClick={handleLogout}
                className="md:hidden p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-rose-500 transition-all relative"
              >
                <LogOut size={20} />
              </button>
              <button 
                onClick={() => setIsOrderModalOpen(true)}
                className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">Nuevo Pedido</span>
              </button>
              <button 
                onClick={() => setIsTransactionModalOpen(true)}
                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all relative"
              >
                <Wallet size={20} />
              </button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-20 gap-4"
              >
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-500 font-bold text-xs uppercase tracking-widest animate-pulse">Cargando datos...</p>
              </motion.div>
            ) : (
              <React.Fragment key="content">
                {activeTab === 'dashboard' && (
                  <DashboardView 
                    financeStats={financeStats}
                    orders={orders}
                    handleTabChange={setActiveTab}
                    isGeneratingInsights={isGeneratingInsights}
                    insights={insights}
                    capacityWarnings={capacityWarnings}
                    onRefreshInsights={generateInsights}
                    setSelectedOrderDetails={setSelectedOrderDetails}
                  />
                )}
                {activeTab === 'orders' && (
                  <OrdersView 
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    showCompletedOrders={showCompletedOrders}
                    setShowCompletedOrders={setShowCompletedOrders}
                    filteredOrders={filteredOrders}
                    setIsOrderModalOpen={setIsOrderModalOpen}
                    setSelectedOrderDetails={setSelectedOrderDetails}
                  />
                )}
                {activeTab === 'finances' && (
                  <FinancesView 
                    getMonthlyData={getMonthlyData}
                    transactions={transactions}
                    formatCurrency={(v: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v)}
                    setTransactionToDelete={async (id: number) => {
                      if (confirm('¿Eliminar esta transacción?')) {
                        try {
                          await safeFetch(`/api/transactions/${id}`, { method: 'DELETE' });
                          fetchData();
                        } catch (err) { /* Handled */ }
                      }
                    }}
                    getCategoryData={getCategoryData}
                    CHART_COLORS={['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']}
                  />
                )}
                {activeTab === 'settings' && (
                  <SettingsView 
                    profile={profile}
                    setProfile={setProfile}
                    setToast={setToast}
                    handleExportJSON={handleExportJSON}
                    fileInputRef={fileInputRef}
                    handleImportJSON={handleImportJSON}
                    isImporting={isImporting}
                    safeFetch={safeFetch}
                    setPasswordPrompt={setPasswordPrompt}
                    limits={limits}
                    fetchData={fetchData}
                    showConfirmation={showConfirmation}
                    forceUpdateApp={forceUpdateApp}
                    handleExportData={handleExportData}
                    isDarkMode={isDarkMode}
                    setIsDarkMode={setIsDarkMode}
                    selectedTheme={selectedTheme}
                    setSelectedTheme={setSelectedTheme}
                  />
                )}
              </React.Fragment>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {/* Order Modal */}
        {isOrderModalOpen && (
          <motion.div 
            key="order-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-[#1A1A1A] rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-white/10"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center">
                <h3 className="text-xl font-bold">Nuevo Pedido</h3>
                <button onClick={() => setIsOrderModalOpen(false)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleCreateOrder} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Cliente</label>
                    <input name="customer_name" required className="input-field w-full" placeholder="Nombre completo" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Teléfono</label>
                    <input name="phone" required className="input-field w-full" placeholder="10 dígitos" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">Dirección</label>
                  <input name="address" className="input-field w-full" placeholder="Calle, número, colonia" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Fecha de Entrega</label>
                    <input name="delivery_date" type="date" required className="input-field w-full" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Tipo de Trabajo</label>
                    <select name="work_type" required className="input-field w-full">
                      <option value="Sala">Sala</option>
                      <option value="Silla">Silla</option>
                      <option value="Asiento Carro">Asiento Carro</option>
                      <option value="Camion">Camión</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">Material</label>
                  <input name="material" className="input-field w-full" placeholder="Tipo de tela, color, etc." />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Total</label>
                    <input name="total" type="number" required className="input-field w-full" placeholder="0.00" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Anticipo</label>
                    <input name="advance" type="number" required className="input-field w-full" placeholder="0.00" />
                  </div>
                </div>
                <button type="submit" className="btn-primary w-full py-4 text-lg">Crear Pedido</button>
              </form>
            </motion.div>
          </motion.div>
        )}

        {/* Transaction Modal */}
        {isTransactionModalOpen && (
          <motion.div 
            key="transaction-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#1A1A1A] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-white/10"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center">
                <h3 className="text-xl font-bold">Registrar Movimiento</h3>
                <button onClick={() => setIsTransactionModalOpen(false)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleCreateTransaction} className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">Concepto</label>
                  <input name="concept" required className="input-field w-full" placeholder="Ej: Compra de hule espuma" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Monto</label>
                    <input name="amount" type="number" required className="input-field w-full" placeholder="0.00" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Tipo</label>
                    <select name="type" required className="input-field w-full">
                      <option value="expense">Gasto</option>
                      <option value="income">Ingreso</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">Categoría</label>
                  <select name="category" required className="input-field w-full">
                    <option value="Materiales">Materiales</option>
                    <option value="Herramientas">Herramientas</option>
                    <option value="Servicios">Servicios (Luz, Agua)</option>
                    <option value="Renta">Renta</option>
                    <option value="Sueldos">Sueldos</option>
                    <option value="Otros">Otros</option>
                  </select>
                </div>
                <button type="submit" className="btn-primary w-full py-4">Registrar</button>
              </form>
            </motion.div>
          </motion.div>
        )}

        {/* Order Details Modal */}
        {selectedOrderDetails && (
          <motion.div 
            key="order-details-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-[#1A1A1A] rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-white/10"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-primary/10 to-transparent">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg",
                    selectedOrderDetails.status === 'completed' ? "bg-emerald-500 text-white" : "bg-primary text-white"
                  )}>
                    {selectedOrderDetails.status === 'completed' ? <CheckCircle2 size={24} /> : <Clock size={24} />}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{selectedOrderDetails.customer_name}</h3>
                    <p className="text-xs text-gray-500 uppercase tracking-widest font-black">Pedido #{selectedOrderDetails.id}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedOrderDetails(null)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-6 space-y-8 overflow-y-auto max-h-[70vh] custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                    <p className="text-[10px] text-gray-500 uppercase font-black mb-1">Trabajo</p>
                    <p className="font-bold">{selectedOrderDetails.work_type}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                    <p className="text-[10px] text-gray-500 uppercase font-black mb-1">Material</p>
                    <p className="font-bold truncate" title={selectedOrderDetails.material}>{selectedOrderDetails.material}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                    <p className="text-[10px] text-gray-500 uppercase font-black mb-1">Entrega</p>
                    <p className="font-bold">{format(new Date(selectedOrderDetails.delivery_date), 'dd/MM/yyyy')}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">Contacto y Ubicación</h4>
                    <div className="space-y-3">
                      <a href={`tel:${selectedOrderDetails.phone}`} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-primary/10 hover:text-primary transition-all group">
                        <Smartphone size={18} className="text-gray-500 group-hover:text-primary" />
                        <span className="font-bold">{selectedOrderDetails.phone}</span>
                      </a>
                      <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5">
                        <ClipboardList size={18} className="text-gray-500 mt-0.5" />
                        <span className="text-sm text-gray-300">{selectedOrderDetails.address || 'Sin dirección registrada'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">Resumen Económico</h4>
                    <div className="card bg-black/30 border-white/5 space-y-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400">Total:</span>
                        <span className="font-mono font-bold">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(selectedOrderDetails.total)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-emerald-500">Anticipo:</span>
                        <span className="font-mono font-bold text-emerald-500">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(selectedOrderDetails.advance)}</span>
                      </div>
                      <div className="pt-3 border-t border-white/10 flex justify-between items-center">
                        <span className="font-bold">Restante:</span>
                        <span className="font-mono font-black text-xl text-primary">
                          {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(selectedOrderDetails.total - selectedOrderDetails.advance)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  {selectedOrderDetails.status === 'pending' && (
                    <>
                      <button 
                        onClick={() => handleCompleteOrder(selectedOrderDetails.id)}
                        className="flex-1 btn-primary py-4 flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 size={20} />
                        Liquidar y Finalizar
                      </button>
                      <button 
                        onClick={() => setPaymentModal({ isOpen: true, orderId: selectedOrderDetails.id, amount: '' })}
                        className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
                      >
                        <Wallet size={20} />
                        Registrar Abono
                      </button>
                    </>
                  )}
                  <button 
                    onClick={() => {
                      const text = profile.whatsapp_template
                        .replace('{empresa}', profile.business_name)
                        .replace('{cliente}', selectedOrderDetails.customer_name)
                        .replace('{trabajo}', selectedOrderDetails.work_type)
                        .replace('{material}', selectedOrderDetails.material)
                        .replace('{entrega}', format(new Date(selectedOrderDetails.delivery_date), 'dd/MM/yyyy'))
                        .replace('{total}', selectedOrderDetails.total.toString())
                        .replace('{anticipo}', selectedOrderDetails.advance.toString())
                        .replace('{restante}', (selectedOrderDetails.total - selectedOrderDetails.advance).toString());
                      
                      const url = `https://wa.me/52${selectedOrderDetails.phone}?text=${encodeURIComponent(text)}`;
                      window.open(url, '_blank');
                    }}
                    className="p-4 rounded-2xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all"
                    title="Enviar WhatsApp"
                  >
                    <MessageCircle size={24} />
                  </button>
                  <button 
                    onClick={() => {
                      setOrderToDelete(selectedOrderDetails.id);
                      setPasswordPrompt({ isOpen: true, action: 'delete_order', passwordInput: '', newPasswordInput: '' });
                    }}
                    className="p-4 rounded-2xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all"
                    title="Eliminar Pedido"
                  >
                    <Trash2 size={24} />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Payment Modal */}
        {paymentModal.isOpen && (
          <div key="payment-modal" className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-[#1A1A1A] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-white/10"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center">
                <h3 className="text-xl font-bold">Registrar Abono</h3>
                <button onClick={() => setPaymentModal({ ...paymentModal, isOpen: false })} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleRegisterPayment} className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">Monto del Abono</label>
                  <input 
                    type="number" 
                    required 
                    className="input-field w-full text-2xl font-mono font-bold" 
                    placeholder="0.00"
                    value={paymentModal.amount}
                    onChange={e => setPaymentModal({ ...paymentModal, amount: e.target.value })}
                    autoFocus
                  />
                </div>
                <button type="submit" className="btn-primary w-full py-4 text-lg">Confirmar Abono</button>
              </form>
            </motion.div>
          </div>
        )}

        {/* Password Prompt Modal */}
        {passwordPrompt.isOpen && (
          <div key="password-modal" className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-[#1A1A1A] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-white/10"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center">
                <h3 className="text-xl font-bold">
                  {passwordPrompt.action === 'delete_order' ? 'Confirmar Eliminación' : 'Cambiar Contraseña'}
                </h3>
                <button onClick={() => setPasswordPrompt({ ...passwordPrompt, isOpen: false })} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                  <X size={24} />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">
                    {passwordPrompt.action === 'change_password' ? 'Contraseña Actual' : 'Contraseña de Administrador'}
                  </label>
                  <input 
                    type="password" 
                    required 
                    className="input-field w-full" 
                    placeholder="••••••••"
                    value={passwordPrompt.passwordInput}
                    onChange={e => setPasswordPrompt({ ...passwordPrompt, passwordInput: e.target.value })}
                    autoFocus
                  />
                </div>
                {passwordPrompt.action === 'change_password' && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Nueva Contraseña</label>
                    <input 
                      type="password" 
                      required 
                      className="input-field w-full" 
                      placeholder="••••••••"
                      value={passwordPrompt.newPasswordInput}
                      onChange={e => setPasswordPrompt({ ...passwordPrompt, newPasswordInput: e.target.value })}
                    />
                  </div>
                )}
                <button 
                  onClick={passwordPrompt.action === 'change_password' ? handleChangePassword : handleDeleteOrder}
                  className={cn(
                    "w-full py-4 rounded-2xl font-bold text-lg transition-all",
                    passwordPrompt.action === 'delete_order' ? "bg-rose-500 hover:bg-rose-600 text-white" : "btn-primary"
                  )}
                >
                  {passwordPrompt.action === 'delete_order' ? 'Eliminar Permanentemente' : 'Actualizar Contraseña'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Post Creator Modal */}
        <PostCreatorModal 
          isOpen={isPostCreatorOpen} 
          onClose={() => setIsPostCreatorOpen(false)} 
          businessName={profile.business_name}
        />

        {/* Confirmation Modal */}
        {confirmationModal.isOpen && (
          <div key="confirmation-modal" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-[#1A1A1A] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-white/10"
            >
              <div className="p-6 border-b border-white/10">
                <h3 className="text-xl font-bold">{confirmationModal.title}</h3>
              </div>
              <div className="p-6 space-y-6">
                <p className="text-gray-400">{confirmationModal.message}</p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setConfirmationModal({ ...confirmationModal, isOpen: false })}
                    className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 font-bold transition-all"
                  >
                    {confirmationModal.cancelText || 'Cancelar'}
                  </button>
                  <button 
                    onClick={() => {
                      confirmationModal.onConfirm();
                      setConfirmationModal({ ...confirmationModal, isOpen: false });
                    }}
                    className={cn(
                      "flex-1 py-3 rounded-xl font-bold transition-all",
                      confirmationModal.type === 'danger' ? "bg-rose-500 hover:bg-rose-600 text-white" : "btn-primary"
                    )}
                  >
                    {confirmationModal.confirmText || 'Confirmar'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            key="toast"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={cn(
              "fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border",
              toast.type === 'success' ? "bg-emerald-500 border-emerald-400 text-white" : "bg-rose-500 border-rose-400 text-white"
            )}
          >
            {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
            <span className="font-bold text-sm">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
