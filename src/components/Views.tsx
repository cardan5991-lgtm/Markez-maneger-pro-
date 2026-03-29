import React from 'react';
import { auth, db } from '../firebase';
import { doc, setDoc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  ClipboardList, 
  Clock, 
  ChevronRight,
  Search,
  X,
  CheckCircle2,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Trash2,
  Settings,
  Image as ImageIcon,
  Upload,
  Download,
  Loader2,
  AlertTriangle,
  Smartphone,
  RefreshCw,
  MessageCircle,
  MessageSquare,
  Send,
  Check,
  Calendar,
  Sparkles,
  Lock
} from 'lucide-react';
import Markdown from 'react-markdown';
import { 
  ComposedChart, 
  CartesianGrid, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Bar, 
  Line, 
  ResponsiveContainer,
  BarChart,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { cn } from '../lib/utils';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

// --- Types ---
type WorkType = 'Sala' | 'Silla' | 'Asiento Carro' | 'Camion';
type TransactionType = 'income' | 'expense';

interface Order {
  id: string;
  customer_name: string;
  phone: string;
  address: string;
  registration_date: string;
  delivery_date: string;
  material: string;
  work_type: string;
  description?: string;
  total: number;
  advance: number;
  status: 'pending' | 'completed' | 'cancelled';
  is_quote?: boolean;
  is_canceled?: boolean;
  archived?: boolean;
}

interface Transaction {
  id: number;
  date: string;
  concept: string;
  amount: number;
  type: TransactionType;
  category: string;
  order_id?: number;
}

// --- Helper Components ---
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2
  }).format(amount);
};

const safeFormatDate = (dateString: string, formatStr: string, options?: any) => {
  try {
    if (!dateString) return 'Fecha inválida';
    
    let date: Date;
    if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [year, month, day] = dateString.split('-');
      date = new Date(Number(year), Number(month) - 1, Number(day));
    } else {
      date = new Date(dateString);
    }
    
    if (isNaN(date.getTime())) {
      return 'Fecha inválida';
    }
    return format(date, formatStr, options);
  } catch (e) {
    return 'Fecha inválida';
  }
};

const StatCard = React.memo(({ title, value, icon: Icon, trend, type = 'neutral', onClick }: any) => (
  <motion.button 
    whileHover={{ y: -4, scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={cn(
      "card flex flex-col gap-3 text-left transition-all duration-300 group",
      onClick ? "cursor-pointer hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/5" : "cursor-default"
    )}
  >
    <div className="flex justify-between items-start">
      <span className="text-gray-400 text-xs font-black uppercase tracking-widest">{title}</span>
      <div className={cn(
        "p-2.5 rounded-xl transition-colors duration-300",
        type === 'income' ? "bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white" : 
        type === 'expense' ? "bg-rose-500/10 text-rose-500 group-hover:bg-rose-500 group-hover:text-white" : 
        "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white"
      )}>
        <Icon size={20} />
      </div>
    </div>
    <div className="flex flex-col gap-1">
      <span className="text-xl md:text-2xl font-black font-mono tracking-tighter">
        {typeof value === 'number' ? formatCurrency(value) : value}
      </span>
      {trend && (
        <div className={cn(
          "text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-full w-fit",
          trend > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
        )}>
          {trend > 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
          {Math.abs(trend)}% vs mes anterior
        </div>
      )}
    </div>
  </motion.button>
));

StatCard.displayName = 'StatCard';

// --- Views ---

export const DashboardView = React.memo(({ 
  financeStats, 
  orders, 
  handleTabChange, 
  isGeneratingInsights, 
  insights, 
  getMonthlyData,
  setSelectedOrderDetails,
  capacityWarnings,
  onRefreshInsights
}: any) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      {/* Capacity Warnings */}
      {capacityWarnings && capacityWarnings.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {capacityWarnings.map((warning: any, idx: number) => (
            <div key={`${warning.type}-${idx}`} className={cn(
              "p-4 rounded-2xl border flex items-center gap-4",
              warning.percentage >= 100 
                ? "bg-rose-500/10 border-rose-500/20 text-rose-500" 
                : "bg-amber-500/10 border-amber-500/20 text-amber-500"
            )}>
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                warning.percentage >= 100 ? "bg-rose-500/20" : "bg-amber-500/20"
              )}>
                <AlertTriangle size={20} />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <h4 className="font-bold text-sm uppercase tracking-wider">{warning.type}</h4>
                  <span className="font-mono font-bold text-xs">{Math.round(warning.percentage)}%</span>
                </div>
                <div className="h-2 bg-black/20 rounded-full overflow-hidden">
                  <div 
                    className={cn("h-full rounded-full transition-all duration-500", warning.percentage >= 100 ? "bg-rose-500" : "bg-amber-500")} 
                    style={{ width: `${Math.min(warning.percentage, 100)}%` }} 
                  />
                </div>
                <p className="text-[10px] mt-1 opacity-80 font-medium">
                  {warning.current} de {warning.limit} pedidos permitidos
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Ingresos Totales" 
          value={financeStats.income} 
          icon={TrendingUp} 
          type="income" 
          trend={12} 
          onClick={() => handleTabChange('finances')}
        />
        <StatCard 
          title="Gastos Totales" 
          value={financeStats.expense} 
          icon={TrendingDown} 
          type="expense" 
          trend={-5} 
          onClick={() => handleTabChange('finances')}
        />
        <StatCard 
          title="Balance Neto" 
          value={financeStats.income - financeStats.expense} 
          icon={Wallet} 
          type="neutral" 
          onClick={() => handleTabChange('finances')}
        />
        <StatCard 
          title="Pedidos Activos" 
          value={orders.filter((o: any) => o.status === 'pending' && !o.is_quote && !o.is_canceled && !o.archived).length} 
          icon={ClipboardList} 
          type="neutral" 
          onClick={() => handleTabChange('orders')}
        />
      </div>

      {/* AI Tools & Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Smart Insights */}
        <div className="card bg-gradient-to-br from-primary/20 to-transparent border-primary/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <TrendingUp className="text-white" size={18} />
            </div>
            <h3 className="text-lg font-bold">Análisis Financiero Semanal (IA)</h3>
            <div className="ml-auto flex items-center gap-2">
              {isGeneratingInsights ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
              ) : (
                <button 
                  onClick={onRefreshInsights}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                  title="Recargar análisis"
                >
                  <RefreshCw size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-line mb-6 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
            {isGeneratingInsights ? (
              <div className="space-y-3">
                <div className="h-4 bg-white/5 rounded-full w-full animate-pulse" />
                <div className="h-4 bg-white/5 rounded-full w-[90%] animate-pulse" />
                <div className="h-4 bg-white/5 rounded-full w-[95%] animate-pulse" />
              </div>
            ) : (
              <div>
                {insights || "Analizando tus datos para darte los mejores consejos..."}
                {(insights?.includes("Falta configuración") || insights?.includes("API Key")) && typeof window !== 'undefined' && (window as any).aistudio && (
                  <button 
                    onClick={async () => {
                      try {
                        await (window as any).aistudio.openSelectKey();
                        onRefreshInsights();
                      } catch (e) {
                        console.error("Error opening key selector", e);
                      }
                    }}
                    className="mt-3 px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg text-xs font-medium transition-colors border border-primary/30"
                  >
                    Configurar API Key
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Chat con Max Button */}
          <div className="mt-auto border-t border-white/10 pt-4">
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent('open-chat-modal'))}
              className="w-full py-3 px-4 bg-primary hover:bg-primary/80 text-white rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <MessageSquare size={18} />
              Chatear con Asesor Max
            </button>
          </div>
        </div>

        {/* AI Tools */}
        <div className="card bg-gradient-to-br from-purple-500/20 to-transparent border-purple-500/20 flex flex-col">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
              <Sparkles className="text-white" size={18} />
            </div>
            <h3 className="text-lg font-bold">Herramientas IA</h3>
          </div>
          <p className="text-sm text-gray-300 mb-6 flex-1">
            Potencia tu negocio con Inteligencia Artificial. Crea contenido atractivo para tus redes sociales en segundos.
          </p>
          <button 
            onClick={() => {
              // We need to pass a callback from App.tsx or use a custom event.
              // Since DashboardView doesn't have setIsPostCreatorOpen, we can dispatch a custom event
              window.dispatchEvent(new CustomEvent('open-post-creator'));
            }}
            className="w-full py-3 px-4 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2"
          >
            <ImageIcon size={18} />
            Abrir Creador de Posts
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart Section */}
        <div className="lg:col-span-2 card">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold">Resumen Financiero</h3>
          </div>
          <div className="h-[250px] min-h-[250px] w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Ingresos', value: financeStats.income },
                    { name: 'Gastos', value: financeStats.expense }
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell key="income" fill="#10b981" /> {/* Emerald-500 */}
                  <Cell key="expense" fill="#f43f5e" /> {/* Rose-500 */}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1E1E1E', border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                  itemStyle={{ color: '#fff' }}
                  formatter={(value: number) => formatCurrency(value)}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-sm text-gray-300">Ingresos: {formatCurrency(financeStats.income)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-rose-500" />
              <span className="text-sm text-gray-300">Gastos: {formatCurrency(financeStats.expense)}</span>
            </div>
          </div>
        </div>

        {/* Recent Orders */}
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold">Próximas Entregas</h3>
            <button onClick={() => handleTabChange('orders')} className="text-primary text-xs font-bold uppercase tracking-wider hover:underline">Ver todos</button>
          </div>
          <div className="space-y-4">
            {orders
              .filter((o: any) => o.status === 'pending' && !o.is_quote && !o.is_canceled && !o.archived)
              .sort((a: any, b: any) => {
                const diff = new Date(a.delivery_date || 0).getTime() - new Date(b.delivery_date || 0).getTime();
                return isNaN(diff) ? 0 : diff;
              })
              .slice(0, 5)
              .map((order: any, idx: number) => (
              <div 
                key={`pending-${order.id}-${idx}`} 
                onClick={() => setSelectedOrderDetails(order)}
                className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-primary">
                  <Clock size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{order.customer_name}</p>
                  <p className="text-xs text-gray-500">{order.work_type} • {safeFormatDate(order.delivery_date, 'dd MMM', { locale: es })}</p>
                </div>
                <ChevronRight size={16} className="text-gray-600 group-hover:text-primary transition-colors" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
});

DashboardView.displayName = 'DashboardView';

export const OrdersView = React.memo(({ 
  searchTerm, 
  setSearchTerm, 
  orderFilter, 
  setOrderFilter, 
  filteredOrders, 
  setIsOrderModalOpen,
  setSelectedOrderDetails
}: any) => {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por cliente o teléfono..." 
            className="input-field w-full pl-10" 
            value={searchTerm || ''}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="flex bg-black/20 p-1 rounded-xl w-fit">
          <button 
            onClick={() => setOrderFilter('pending')}
            className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all", orderFilter === 'pending' ? "bg-white shadow-sm text-black" : "text-gray-400 hover:text-white")}
          >
            Pendientes
          </button>
          <button 
            onClick={() => setOrderFilter('completed')}
            className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all", orderFilter === 'completed' ? "bg-white shadow-sm text-black" : "text-gray-400 hover:text-white")}
          >
            Completados
          </button>
          <button 
            onClick={() => setOrderFilter('quotes')}
            className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all", orderFilter === 'quotes' ? "bg-white shadow-sm text-black" : "text-gray-400 hover:text-white")}
          >
            Presupuestos
          </button>
        </div>
        <div className="flex gap-2">
          <button className="bg-white/5 p-2 rounded-lg text-gray-400 hover:text-white transition-colors">
            <Filter size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredOrders.length === 0 && (
          <div className="col-span-full py-20 text-center card bg-white/5 border-dashed border-white/10">
            <ClipboardList className="mx-auto text-gray-600 mb-4 opacity-20" size={64} />
            <p className="text-gray-400 font-medium text-lg">No hay {orderFilter === 'quotes' ? 'presupuestos' : 'pedidos'} {orderFilter === 'completed' ? 'en el historial' : 'pendientes'}</p>
            {searchTerm && <p className="text-gray-500 text-sm mt-1">No se encontraron resultados para "{searchTerm}"</p>}
            {orderFilter === 'pending' && !searchTerm ? (
              <div className="flex flex-col gap-2 mt-4">
                <button 
                  onClick={() => setIsOrderModalOpen(true)}
                  className="text-primary font-bold hover:underline"
                >
                  + Crear mi primer pedido
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setOrderFilter('pending')}
                className="mt-4 text-gray-500 text-sm hover:text-white transition-colors"
              >
                Volver a pedidos pendientes
              </button>
            )}
          </div>
        )}

        {filteredOrders.map((order: any, idx: number) => (
          <motion.div 
            layout
            key={`order-${order.id}-${idx}`}
            onClick={() => setSelectedOrderDetails(order)}
            className="card group cursor-pointer hover:border-primary/30 transition-all"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  order.status === 'completed' ? "bg-emerald-500/10 text-emerald-500" : "bg-primary/10 text-primary"
                )}>
                  {order.status === 'completed' ? <CheckCircle2 size={20} /> : <Clock size={20} />}
                </div>
                <div>
                  <h4 className="font-bold text-lg">{order.customer_name}</h4>
                  <p className="text-xs text-gray-500 uppercase tracking-widest font-black">{order.work_type}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono font-black text-lg">{formatCurrency(order.total)}</p>
                <p className="text-[10px] text-gray-500 uppercase font-bold">{order.is_quote ? 'Total Cotizado' : 'Total del Trabajo'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="p-3 bg-white/5 rounded-xl">
                <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Material</p>
                <p className="text-sm font-medium truncate">{order.material}</p>
              </div>
              <div className="p-3 bg-white/5 rounded-xl">
                <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Entrega</p>
                <p className="text-sm font-medium">{safeFormatDate(order.delivery_date, 'dd/MM/yyyy')}</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-white/5">
              <div className="flex items-center gap-2">
                {!order.is_quote && (
                  <>
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-bold text-emerald-500">Anticipo: {formatCurrency(order.advance)}</span>
                  </>
                )}
                {order.is_quote && (
                  <>
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-xs font-bold text-blue-500">Cotización</span>
                  </>
                )}
              </div>
              <ChevronRight size={18} className="text-gray-600 group-hover:text-primary group-hover:translate-x-1 transition-all" />
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
});

OrdersView.displayName = 'OrdersView';

export const FinancesView = React.memo(({ 
  getMonthlyData, 
  getWeeklyData,
  currentWeekStats,
  transactions, 
  formatCurrency, 
  setTransactionToDelete, 
  getCategoryData, 
  CHART_COLORS 
}: any) => {
  return (
    <motion.div 
      key="finances"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="space-y-8"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          
          {/* Weekly Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/20">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-500">
                  <TrendingUp size={20} />
                </div>
                <h3 className="text-sm font-bold text-emerald-500 uppercase tracking-wider">Ingresos de esta semana</h3>
              </div>
              <p className="text-3xl font-black font-mono text-emerald-500">{formatCurrency(currentWeekStats?.income || 0)}</p>
            </div>
            <div className="card bg-gradient-to-br from-rose-500/10 to-transparent border-rose-500/20">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-rose-500/20 text-rose-500">
                  <TrendingDown size={20} />
                </div>
                <h3 className="text-sm font-bold text-rose-500 uppercase tracking-wider">Gastos de esta semana</h3>
              </div>
              <p className="text-3xl font-black font-mono text-rose-500">{formatCurrency(currentWeekStats?.expense || 0)}</p>
            </div>
          </div>

          {/* Weekly Chart */}
          <div className="card">
            <h3 className="text-lg font-bold mb-6">Desglose de esta Semana</h3>
            <div className="h-[250px] min-h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={getWeeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v.toLocaleString()}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1E1E1E', border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="income" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Gastos" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Monthly Chart */}
          <div className="card">
            <h3 className="text-lg font-bold mb-6">Desglose Mensual</h3>
            <div className="h-[250px] min-h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={getMonthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v.toLocaleString()}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1E1E1E', border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="income" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Gastos" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-bold mb-6">Historial de Transacciones</h3>
            <div className="space-y-2">
              {transactions.length === 0 && (
                <div className="py-10 text-center text-gray-500 text-sm">No hay transacciones registradas</div>
              )}
              {transactions.map((t: any, idx: number) => (
                <div key={`trans-${t.id}-${idx}`} className={cn(
                  "flex items-center justify-between p-4 rounded-xl hover:bg-white/5 transition-colors group",
                  t.is_canceled && "opacity-50"
                )}>
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      t.type === 'income' ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                    )}>
                      {t.type === 'income' ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={cn("font-medium", t.is_canceled && "line-through")}>{t.concept}</p>
                        {t.is_canceled && (
                          <span className="text-[10px] uppercase tracking-wider bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full font-bold">
                            Cancelado
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{t.category} • {safeFormatDate(t.date, 'dd MMM, HH:mm', { locale: es })}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={cn(
                      "font-bold font-mono",
                      t.type === 'income' ? "text-emerald-500" : "text-rose-500",
                      t.is_canceled && "line-through"
                    )}>
                      {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                    </span>
                    <button 
                      onClick={() => setTransactionToDelete(t.id)}
                      className="p-2 rounded-lg text-gray-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card">
            <h3 className="text-lg font-bold mb-6">Gastos por Categoría</h3>
            <div className="h-[240px] min-h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={getCategoryData.length > 0 ? getCategoryData : [{ name: 'Sin datos', value: 1 }]}
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {getCategoryData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                    {getCategoryData.length === 0 && <Cell key="empty" fill="#ffffff10" />}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1E1E1E', border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)' }}
                    itemStyle={{ color: '#fff' }}
                    formatter={(value: number) => [formatCurrency(value), 'Monto']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-6 space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
              {getCategoryData.map((cat: any, i: number) => (
                <div key={`cat-${cat.name}-${i}`} className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="text-gray-300 font-medium">{cat.name}</span>
                  </div>
                  <span className="font-bold font-mono text-primary">{formatCurrency(cat.value)}</span>
                </div>
              ))}
              {getCategoryData.length === 0 && (
                <div className="flex flex-col items-center justify-center py-4 opacity-20">
                  <AlertTriangle size={24} className="mb-2" />
                  <p className="text-xs uppercase tracking-widest">Sin gastos registrados</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

FinancesView.displayName = 'FinancesView';

const LimitInput = ({ workType, limit, currentUser }: { workType: string, limit: any, currentUser: any }) => {
  const [val, setVal] = React.useState(limit?.limit_val || 0);

  React.useEffect(() => {
    setVal(limit?.limit_val || 0);
  }, [limit?.limit_val]);

  const handleBlur = async () => {
    if (!currentUser) return;
    const newVal = Number(val);
    if (newVal === (limit?.limit_val || 0)) return; // No change

    try {
      const limitId = workType.replace(/\s+/g, '_').toLowerCase();
      await setDoc(doc(db, `users/${currentUser.uid}/limits`, limitId), { 
        work_type: workType, 
        limit_val: newVal, 
        uid: currentUser.uid 
      }, { merge: true });
    } catch (err) {
      console.error("Error updating limit:", err);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-gray-500 uppercase">{workType}</label>
      <input 
        type="number" 
        className="input-field" 
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={handleBlur}
      />
    </div>
  );
};

export const SettingsView = React.memo(({ 
  profile, 
  setProfile, 
  setToast, 
  handleExportJSON, 
  fileInputRef, 
  handleImportJSON, 
  isImporting, 
  showConfirmation, 
  forceUpdateApp, 
  limits, 
  setLimits,
  handleExportData, 
  isDarkMode, 
  setIsDarkMode, 
  selectedTheme, 
  setSelectedTheme,
  setPasswordPrompt
}: any) => {
  return (
    <motion.div 
      key="settings"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 pb-12"
    >
      <div className="card space-y-6">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Settings size={20} className="text-primary" />
          Datos de la Tapicería
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase">Nombre del Negocio</label>
            <input 
              type="text" 
              className="input-field" 
              value={profile.business_name || ''}
              onChange={e => setProfile({...profile, business_name: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase">Teléfono</label>
            <input 
              type="text" 
              className="input-field" 
              value={profile.phone || ''}
              onChange={e => setProfile({...profile, phone: e.target.value})}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase">Dirección</label>
            <input 
              type="text" 
              className="input-field" 
              value={profile.address || ''}
              onChange={e => setProfile({...profile, address: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase">Logo de la Tapicería</label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                {profile.logo_url ? (
                  <img src={profile.logo_url} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <ImageIcon className="text-gray-600" size={24} />
                )}
              </div>
              <label className="flex-1 cursor-pointer">
                <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/5 border border-dashed border-white/20 hover:bg-white/10 transition-colors text-sm font-medium text-gray-400">
                  <Upload size={18} />
                  <span>Subir Imagen</span>
                </div>
                <input 
                  type="file" 
                  className="hidden" 
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setProfile({...profile, logo_url: reader.result as string});
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              </label>
              {profile.logo_url && (
                <button 
                  onClick={() => setProfile({...profile, logo_url: ''})}
                  className="p-3 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors"
                  title="Eliminar Logo"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
        <button 
          onClick={async () => {
            if (!auth.currentUser) return;
            try {
              await setDoc(doc(db, 'users', auth.currentUser.uid), { ...profile, uid: auth.currentUser.uid }, { merge: true });
              setToast({ message: 'Perfil actualizado correctamente', type: 'success' });
              setTimeout(() => setToast(null), 3000);
            } catch (err: any) {
              setToast({ message: 'Error al actualizar perfil: ' + err.message, type: 'error' });
              setTimeout(() => setToast(null), 3000);
            }
          }}
          className="btn-primary w-full"
        >
          Guardar Perfil
        </button>
      </div>

      <div className="card space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-rose-500/10 rounded-xl flex items-center justify-center">
            <Lock className="text-rose-500" size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold">Seguridad de la Cuenta</h3>
            <p className="text-gray-500 text-xs">Administra tu contraseña de acceso</p>
          </div>
        </div>
        <div className="p-4 rounded-2xl border border-theme-border space-y-3" style={{ backgroundColor: 'var(--app-bg-dark)' }}>
          <p className="text-sm text-gray-400">Cambia la contraseña utilizada para iniciar sesión y eliminar pedidos.</p>
          <button 
            onClick={() => setPasswordPrompt({ isOpen: true, action: 'change_password', passwordInput: '', newPasswordInput: '' })}
            className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
          >
            <Lock size={16} />
            Cambiar Contraseña
          </button>
        </div>
      </div>

      <div className="card space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
            <CheckCircle2 className="text-emerald-500" size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold">Respaldo y Seguridad</h3>
            <p className="text-gray-500 text-xs">Tu información está segura en la nube</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 flex items-start gap-4">
          <div className="p-2 bg-emerald-500/20 rounded-lg shrink-0">
            <RefreshCw className="text-emerald-500 animate-spin-slow" size={20} />
          </div>
          <div>
            <h4 className="font-bold text-emerald-500 mb-1">Copia de Seguridad Automática Activada</h4>
            <p className="text-sm text-gray-400">
              Todos tus pedidos, finanzas y configuraciones se guardan automáticamente en la nube de forma segura en tiempo real. No necesitas realizar respaldos manuales.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl border border-theme-border space-y-3" style={{ backgroundColor: 'var(--app-bg-dark)' }}>
            <p className="text-sm text-gray-400">Descarga una copia de seguridad completa de todos tus pedidos y finanzas.</p>
            <button 
              onClick={handleExportJSON}
              className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
            >
              <Download size={16} />
              Exportar Respaldo (.json)
            </button>
          </div>

          <div className="p-4 rounded-2xl border border-theme-border space-y-3" style={{ backgroundColor: 'var(--app-bg-dark)' }}>
            <p className="text-sm text-gray-400">Restaura tus datos desde un archivo de respaldo previamente guardado.</p>
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={(e) => {
                console.log('[UI] Archivo seleccionado para importar');
                handleImportJSON(e);
              }}
              style={{ display: 'none' }}
              accept=".json"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="w-full py-3 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
            >
              {isImporting ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
              Importar Respaldo
            </button>
          </div>
        </div>
        
        <div className="mt-4 p-4 bg-rose-500/5 border border-rose-500/10 rounded-2xl flex gap-3">
          <AlertTriangle className="text-rose-500 shrink-0" size={20} />
          <p className="text-xs text-gray-500 leading-relaxed">
            <span className="text-rose-500 font-bold">Nota importante:</span> Debido a que la App está en fase de desarrollo, los datos podrían borrarse al realizar cambios técnicos. Te recomendamos <span className="text-white font-bold">exportar tu respaldo diariamente</span> para asegurar tu información.
          </p>
        </div>
      </div>

      <div className="card space-y-6">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Smartphone size={20} className="text-primary" />
          Sistema y Caché
        </h3>
        <p className="text-sm text-gray-400">
          Si la aplicación no se instala correctamente o la barra de búsqueda sigue apareciendo, usa este botón para limpiar la memoria y forzar una actualización.
        </p>
        <button 
          onClick={() => {
            showConfirmation({
              title: 'Limpiar Memoria',
              message: '¿Deseas limpiar la memoria y reiniciar la aplicación? Esto puede solucionar problemas de carga.',
              onConfirm: forceUpdateApp,
              confirmText: 'Reiniciar',
              cancelText: 'Cancelar',
              type: 'danger'
            });
          }}
          className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
        >
          <RefreshCw size={18} />
          Limpiar memoria y reiniciar
        </button>
      </div>

      <div className="card space-y-6">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <AlertTriangle size={20} className="text-primary" />
          Límites de Capacidad Mensual
        </h3>
        <div className="grid grid-cols-2 gap-4">
          {['Sala', 'Silla', 'Asiento Carro', 'Camion'].map((workType: string, idx: number) => {
            const limit = (limits || []).find((l: any) => l.work_type === workType);
            return (
              <LimitInput 
                key={`limit-${workType}-${idx}`} 
                workType={workType} 
                limit={limit} 
                currentUser={auth.currentUser} 
              />
            );
          })}
        </div>
      </div>

      <div className="card space-y-6">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <MessageCircle size={20} className="text-primary" />
          Plantilla de WhatsApp
        </h3>
        <div className="space-y-2">
          <p className="text-xs text-gray-400">Usa etiquetas: {'{empresa}, {cliente}, {trabajo}, {material}, {entrega}, {total}, {anticipo}, {restante}'}</p>
          <textarea 
            className="input-field h-32 resize-none" 
            value={profile.whatsapp_template || ''}
            onChange={e => setProfile({...profile, whatsapp_template: e.target.value})}
          />
        </div>
        <button 
          onClick={async () => {
            if (!auth.currentUser) return;
            try {
              await setDoc(doc(db, 'users', auth.currentUser.uid), { ...profile, uid: auth.currentUser.uid }, { merge: true });
              setToast({ message: 'Plantilla guardada', type: 'success' });
              setTimeout(() => setToast(null), 3000);
            } catch (err: any) {
              setToast({ message: 'Error al guardar plantilla: ' + err.message, type: 'error' });
              setTimeout(() => setToast(null), 3000);
            }
          }}
          className="btn-primary w-full"
        >
          Guardar Plantilla
        </button>
      </div>

      <div className="card space-y-6">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Download size={20} className="text-primary" />
          Respaldo y Exportación
        </h3>
        <p className="text-sm text-gray-400">Descarga una copia de todos tus pedidos y transacciones en formato CSV para abrir en Excel.</p>
        <button 
          onClick={handleExportData}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          <Download size={20} />
          Exportar Datos a Excel (CSV)
        </button>
        

      </div>

      <div className="card space-y-6">
        <h3 className="text-lg font-bold">Apariencia y Temas</h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Modo Oscuro</span>
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                isDarkMode ? "bg-primary" : "bg-gray-300"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                isDarkMode ? "left-7" : "left-1"
              )} />
            </button>
          </div>

          {isDarkMode && (
            <div className="grid grid-cols-1 gap-3 pt-2">
              <button 
                onClick={() => setSelectedTheme('default')}
                className={cn(
                  "flex items-center justify-between p-3 rounded-xl border transition-all",
                  selectedTheme === 'default' ? "bg-primary/10 border-primary text-white" : "bg-white/5 border-white/5 text-gray-400"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-rose-600" />
                  <span className="text-sm font-medium">Modo Clásico (Rojo)</span>
                </div>
                {selectedTheme === 'default' && <Check size={16} className="text-primary" />}
              </button>

              <button 
                onClick={() => setSelectedTheme('blue')}
                className={cn(
                  "flex items-center justify-between p-3 rounded-xl border transition-all",
                  selectedTheme === 'blue' ? "bg-primary/10 border-primary text-white" : "bg-white/5 border-white/5 text-gray-400"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-blue-500" />
                  <span className="text-sm font-medium">Modo Azul</span>
                </div>
                {selectedTheme === 'blue' && <Check size={16} className="text-primary" />}
              </button>

              <button 
                onClick={() => setSelectedTheme('leather')}
                className={cn(
                  "flex items-center justify-between p-3 rounded-xl border transition-all",
                  selectedTheme === 'leather' ? "bg-primary/10 border-primary text-white" : "bg-white/5 border-white/5 text-gray-400"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-orange-600" />
                  <span className="text-sm font-medium">Modo Cuero</span>
                </div>
                {selectedTheme === 'leather' && <Check size={16} className="text-primary" />}
              </button>
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-between border-t border-white/5 pt-4">
          <div className="flex flex-col">
            <span className="text-gray-400">Usar WhatsApp Business</span>
            <span className="text-[10px] text-gray-500">Forzar el envío desde la app de negocios</span>
          </div>
          <button 
            onClick={async () => {
              const newProfile = {...profile, use_whatsapp_business: !profile.use_whatsapp_business};
              setProfile(newProfile);
              try {
                if (!auth.currentUser) return;
                await setDoc(doc(db, 'users', auth.currentUser.uid), { ...newProfile, uid: auth.currentUser.uid }, { merge: true });
                setToast({ message: 'Preferencia guardada', type: 'success' });
                setTimeout(() => setToast(null), 2000);
              } catch (err: any) {
                setToast({ message: 'Error al guardar preferencia: ' + err.message, type: 'error' });
                setTimeout(() => setToast(null), 2000);
              }
            }}
            className={cn(
              "w-12 h-6 rounded-full transition-colors relative",
              profile.use_whatsapp_business ? "bg-emerald-500" : "bg-gray-300"
            )}
          >
            <div className={cn(
              "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
              profile.use_whatsapp_business ? "left-7" : "left-1"
            )} />
          </button>
        </div>
      </div>
    </motion.div>
  );
});

SettingsView.displayName = 'SettingsView';

export const CalendarView = React.memo(({ orders }: { orders: Order[] }) => {
  const [currentMonth, setCurrentMonth] = React.useState(new Date());
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(null);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const dateFormat = "MMMM yyyy";
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  const getOrdersForDay = (day: Date) => {
    return orders.filter(o => {
      if (o.is_quote || o.is_canceled || o.archived) return false;
      try {
        let orderDate: Date;
        if (typeof o.delivery_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.delivery_date)) {
          const [year, month, d] = o.delivery_date.split('-');
          orderDate = new Date(Number(year), Number(month) - 1, Number(d));
        } else {
          orderDate = new Date(o.delivery_date);
        }
        return isSameDay(orderDate, day);
      } catch (e) {
        return false;
      }
    });
  };

  const selectedOrders = selectedDate ? getOrdersForDay(selectedDate) : [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black tracking-tighter text-white">Mi Calendario</h2>
          <p className="text-gray-400 mt-1">Organiza tus entregas de trabajo</p>
        </div>
      </div>

      <div className="card p-6">
        <div className="flex justify-between items-center mb-6">
          <button onClick={prevMonth} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
            <ChevronRight className="rotate-180" />
          </button>
          <h3 className="text-xl font-bold capitalize">{format(currentMonth, dateFormat, { locale: es })}</h3>
          <button onClick={nextMonth} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
            <ChevronRight />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-2">
          {weekDays.map(day => (
            <div key={day} className="text-center text-sm font-bold text-gray-500 uppercase tracking-wider py-2">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {days.map((day, i) => {
            const dayOrders = getOrdersForDay(day);
            const hasOrders = dayOrders.length > 0;
            const allCompleted = hasOrders && dayOrders.every(o => o.status === 'completed');
            const isCurrentMonth = isSameMonth(day, monthStart);

            return (
              <div
                key={day.toString()}
                onClick={() => hasOrders && setSelectedDate(day)}
                className={cn(
                  "min-h-[80px] p-2 rounded-xl border transition-all duration-300 relative",
                  !isCurrentMonth ? "opacity-30 border-transparent bg-white/5" : "border-white/10 bg-[#1A1A1A]",
                  hasOrders ? "cursor-pointer hover:shadow-lg" : "",
                  hasOrders && !allCompleted ? "hover:shadow-rose-500/20" : "",
                  hasOrders && allCompleted ? "hover:shadow-emerald-500/20" : "",
                  hasOrders && isCurrentMonth && !allCompleted ? "border-rose-500/50 bg-rose-500/10" : "",
                  hasOrders && isCurrentMonth && allCompleted ? "border-emerald-500/50 bg-emerald-500/10" : ""
                )}
              >
                <div className="flex justify-between items-start">
                  <span className={cn(
                    "text-sm font-bold",
                    hasOrders && !allCompleted ? "text-rose-500" : "",
                    hasOrders && allCompleted ? "text-emerald-500" : "",
                    !hasOrders ? "text-gray-400" : ""
                  )}>
                    {format(day, 'd')}
                  </span>
                  {hasOrders && (
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      !allCompleted ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                    )} />
                  )}
                </div>
                {hasOrders && (
                  <div className="mt-2 flex flex-col gap-1">
                    {dayOrders.slice(0, 2).map((order, idx) => (
                      <div key={idx} className={cn(
                        "text-[10px] truncate px-1.5 py-0.5 rounded",
                        order.status === 'completed' ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                      )}>
                        {order.customer_name}
                      </div>
                    ))}
                    {dayOrders.length > 2 && (
                      <div className={cn(
                        "text-[10px] font-bold",
                        !allCompleted ? "text-rose-500/70" : "text-emerald-500/70"
                      )}>
                        +{dayOrders.length - 2} más
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {selectedDate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedDate(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#141414] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                <div>
                  <h3 className="text-xl font-black text-white">Entregas del Día</h3>
                  <p className="text-sm text-gray-400 capitalize">{format(selectedDate, "EEEE, d 'de' MMMM", { locale: es })}</p>
                </div>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-4">
                {selectedOrders.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No hay entregas para este día.</p>
                ) : (
                  selectedOrders.map(order => (
                    <div key={order.id} className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-primary/30 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-white">{order.customer_name}</h4>
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider",
                          order.status === 'completed' ? "bg-emerald-500/10 text-emerald-500" :
                          order.status === 'cancelled' ? "bg-rose-500/10 text-rose-500" :
                          "bg-amber-500/10 text-amber-500"
                        )}>
                          {order.status === 'completed' ? 'Completado' : order.status === 'cancelled' ? 'Cancelado' : 'Pendiente'}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm text-gray-400">
                        <p><span className="text-gray-500">Trabajo:</span> {order.work_type}</p>
                        <p><span className="text-gray-500">Material:</span> {order.material}</p>
                        {order.phone && <p><span className="text-gray-500">Teléfono:</span> {order.phone}</p>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

CalendarView.displayName = 'CalendarView';
