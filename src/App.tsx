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
  Loader2,
  Calendar,
  MessageSquare,
  Send,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { GoogleGenAI } from '@google/genai';
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from './lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { db, auth } from './firebase';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, addDoc } from 'firebase/firestore';
import { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { 
  DashboardView, 
  OrdersView, 
  FinancesView, 
  SettingsView,
  CalendarView
} from './components/Views';
import { PostCreatorModal } from './components/PostCreatorModal';

// --- Types ---
type Tab = 'dashboard' | 'orders' | 'finances' | 'settings' | 'calendar';

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
  id: string;
  date: string;
  concept: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  order_id?: string;
  is_canceled?: boolean;
  archived?: boolean;
}

interface Profile {
  business_name: string;
  address: string;
  phone: string;
  logo_url: string;
  whatsapp_template: string;
  use_whatsapp_business: boolean;
}

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

// --- Main App ---
export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
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
    whatsapp_template: 'Estimado/a {cliente}, le saludamos de {empresa}. Su pedido de {trabajo} estará listo el {entrega}. Total: ${total} | Restante: ${restante}. Agradecemos su confianza y preferencia.',
    use_whatsapp_business: false
  });
  const [limits, setLimits] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  
  // Auth state
  const [authMode, setAuthMode] = useState<'google' | 'email_login' | 'email_register'>('google');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  const [insights, setInsights] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'model', text: string, timestamp: string}[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const prevMessagesLengthRef = useRef(0);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isChatModalOpen) {
      setUnreadChatCount(0);
      prevMessagesLengthRef.current = chatMessages.length;
    } else {
      if (chatMessages.length > prevMessagesLengthRef.current) {
        const newMessages = chatMessages.slice(prevMessagesLengthRef.current);
        const newModelMessages = newMessages.filter(m => m.role === 'model').length;
        if (newModelMessages > 0) {
          setUnreadChatCount(prev => prev + newModelMessages);
        }
      }
      prevMessagesLengthRef.current = chatMessages.length;
    }
  }, [chatMessages, isChatModalOpen]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatModalOpen]);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (isChatModalOpen) {
        setIsChatModalOpen(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isChatModalOpen]);

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const isLoggingInRef = useRef(false);

  useEffect(() => {
    const handleOpenChat = () => {
      window.history.pushState({ chatOpen: true }, '');
      setIsChatModalOpen(true);
    };
    window.addEventListener('open-chat-modal', handleOpenChat);
    return () => window.removeEventListener('open-chat-modal', handleOpenChat);
  }, []);

  const closeChatModal = () => {
    if (window.history.state?.chatOpen) {
      window.history.back();
    } else {
      setIsChatModalOpen(false);
    }
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [orderFilter, setOrderFilter] = useState<'pending' | 'completed' | 'quotes'>('pending');
  const [orderModalType, setOrderModalType] = useState<'order' | 'quote'>('order');
  const [quoteToConvert, setQuoteToConvert] = useState<Order | null>(null);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<Order | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'warning' } | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [selectedTheme, setSelectedTheme] = useState('default');
  const [confirmationModal, setConfirmationModal] = useState<any>({ isOpen: false, title: '', message: '', onConfirm: () => {}, confirmText: '', cancelText: '', type: 'primary' });
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [passwordPrompt, setPasswordPrompt] = useState<any>({ isOpen: false, action: '', passwordInput: '', newPasswordInput: '' });
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);
  const [paymentModal, setPaymentModal] = useState<{ isOpen: boolean, orderId: string | null, amount: string }>({ isOpen: false, orderId: null, amount: '' });
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [monthlyReportReady, setMonthlyReportReady] = useState<{ month: number, year: number, transactions: Transaction[] } | null>(null);
  const [snoozedMonthlyReportKey, setSnoozedMonthlyReportKey] = useState<string | null>(null);
  const [weeklyReportReady, setWeeklyReportReady] = useState<{
    startDate: Date;
    endDate: Date;
    transactions: Transaction[];
    orders: Order[];
    cutoffKey: string;
  } | null>(null);
  const [snoozedWeeklyReportKey, setSnoozedWeeklyReportKey] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  enum OperationType {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
    LIST = 'list',
    GET = 'get',
    WRITE = 'write',
  }

  interface FirestoreErrorInfo {
    error: string;
    operationType: OperationType;
    path: string | null;
    authInfo: {
      userId: string | undefined;
      email: string | null | undefined;
      emailVerified: boolean | undefined;
      isAnonymous: boolean | undefined;
      tenantId: string | null | undefined;
      providerInfo: {
        providerId: string;
        displayName: string | null;
        email: string | null;
        photoUrl: string | null;
      }[];
    }
  }

  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
      },
      operationType,
      path
    }
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  };

  // --- API Calls ---
  useEffect(() => {
    document.body.className = '';
    if (!isDarkMode) document.body.classList.add('light-mode');
    if (selectedTheme === 'blue') document.body.classList.add('theme-blue');
    if (selectedTheme === 'leather') document.body.classList.add('theme-leather');
  }, [isDarkMode, selectedTheme]);

  useEffect(() => {
    // Handle redirect result for mobile PWAs/WebViews
    getRedirectResult(auth).then(async (result) => {
      if (result && result.user) {
        const userRef = doc(db, 'users', result.user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: result.user.uid,
            role: 'user',
            business_name: 'Markez Tapicería',
            address: '',
            phone: '',
            logo_url: '',
            use_whatsapp_business: false
          });
        }
      }
    }).catch((error) => {
      console.error("Redirect login error:", error);
    });

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
        setOrders([]);
        setTransactions([]);
        setLimits([]);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser) return;

    const userId = auth.currentUser.uid;

    const unsubProfile = onSnapshot(doc(db, 'users', userId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setProfile({
          business_name: data.business_name || 'Markez Tapicería',
          address: data.address || '',
          phone: data.phone || '',
          logo_url: data.logo_url || '',
          whatsapp_template: data.whatsapp_template || 'Estimado/a {cliente}, le saludamos de {empresa}. Su pedido de {trabajo} estará listo el {entrega}. Total: ${total} | Restante: ${restante}. Agradecemos su confianza y preferencia.',
          use_whatsapp_business: data.use_whatsapp_business || false
        });
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${userId}`));

    const unsubOrders = onSnapshot(collection(db, `users/${userId}/orders`), (snapshot) => {
      const newOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      setOrders(newOrders);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${userId}/orders`));

    const unsubTransactions = onSnapshot(collection(db, `users/${userId}/transactions`), (snapshot) => {
      const newTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setTransactions(newTransactions);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${userId}/transactions`));

    const unsubLimits = onSnapshot(collection(db, `users/${userId}/limits`), (snapshot) => {
      const newLimits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLimits(newLimits);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${userId}/limits`));

    let isInitialChatSnapshot = true;
    const unsubChat = onSnapshot(query(collection(db, `users/${userId}/financial_chat`), orderBy('timestamp', 'asc')), (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      if (isInitialChatSnapshot) {
        prevMessagesLengthRef.current = msgs.length;
        isInitialChatSnapshot = false;
      }
      setChatMessages(msgs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${userId}/financial_chat`));

    return () => {
      unsubProfile();
      unsubOrders();
      unsubTransactions();
      unsubLimits();
      unsubChat();
    };
  }, [isLoggedIn]);

  // Listen for custom events
  useEffect(() => {
    const handleOpenPostCreator = () => setIsPostCreatorOpen(true);
    window.addEventListener('open-post-creator', handleOpenPostCreator);
    return () => window.removeEventListener('open-post-creator', handleOpenPostCreator);
  }, []);

  // --- Computed Data ---
  const visibleTransactions = useMemo(() => {
    return transactions.filter(t => !t.archived);
  }, [transactions]);

  const validTransactions = useMemo(() => {
    return transactions.filter(t => !t.is_canceled && !t.archived);
  }, [transactions]);

  const financeStats = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    let lastCutoff = new Date(now);
    if (dayOfWeek === 6 && now.getHours() >= 15) {
      lastCutoff.setHours(15, 0, 0, 0);
    } else {
      const daysToSubtract = dayOfWeek === 6 ? 7 : dayOfWeek + 1;
      lastCutoff.setDate(now.getDate() - daysToSubtract);
      lastCutoff.setHours(15, 0, 0, 0);
    }

    const currentWeekTxs = validTransactions.filter(t => new Date(t.date) > lastCutoff);

    const income = currentWeekTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0);
    const expense = currentWeekTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);
    return { income, expense };
  }, [validTransactions]);

  const filteredOrders = useMemo(() => {
    const filtered = orders.filter(o => {
      if (o.is_canceled || o.archived) return false;
      
      const customerName = o.customer_name || '';
      const phone = o.phone || '';
      const search = (searchTerm || '').toLowerCase();
      
      const matchesSearch = customerName.toLowerCase().includes(search) || 
                            phone.includes(search);
                            
      let matchesStatus = false;
      if (orderFilter === 'quotes') {
        matchesStatus = !!o.is_quote;
      } else if (orderFilter === 'completed') {
        matchesStatus = !o.is_quote && o.status === 'completed';
      } else {
        matchesStatus = !o.is_quote && o.status === 'pending';
      }
      return matchesSearch && matchesStatus;
    });

    return filtered.sort((a, b) => {
      const dateA = new Date(a.delivery_date || 0).getTime();
      const dateB = new Date(b.delivery_date || 0).getTime();
      const diff = dateA - dateB;
      if (isNaN(diff)) return 0;
      
      if (orderFilter === 'completed') {
        return -diff; // Descending for completed
      }
      return diff; // Ascending for pending and quotes
    });
  }, [orders, searchTerm, orderFilter]);

  const capacityWarnings = useMemo(() => {
    const pendingByWork = orders.filter(o => o.status === 'pending' && !o.is_quote && !o.is_canceled && !o.archived).reduce((acc: any, o) => {
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

    validTransactions.forEach(t => {
      const tDate = new Date(t.date);
      const monthData = months.find(m => m.month === tDate.getMonth() && m.year === tDate.getFullYear());
      if (monthData) {
        if (t.type === 'income') monthData.income += Number(t.amount);
        else monthData.expense += Number(t.amount);
      }
    });

    return months;
  }, [validTransactions]);

  const getWeeklyData = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    let lastCutoff = new Date(now);
    if (dayOfWeek === 6 && now.getHours() >= 15) {
      lastCutoff.setHours(15, 0, 0, 0);
    } else {
      const daysToSubtract = dayOfWeek === 6 ? 7 : dayOfWeek + 1;
      lastCutoff.setDate(now.getDate() - daysToSubtract);
      lastCutoff.setHours(15, 0, 0, 0);
    }

    const start = lastCutoff;
    const end = new Date(start);
    end.setDate(end.getDate() + 6); // 7 days total (Sat to Fri, or Sat to Sat)
    
    // We want to show 7 days starting from Saturday
    const days = eachDayOfInterval({ start, end }).map(date => ({
      date,
      name: format(date, 'EEEE', { locale: es }).substring(0, 3).toUpperCase(),
      income: 0,
      expense: 0
    }));

    validTransactions.forEach(t => {
      const tDate = new Date(t.date);
      if (tDate > start) {
        const dayData = days.find(d => isSameDay(d.date, tDate));
        if (dayData) {
          if (t.type === 'income') dayData.income += Number(t.amount);
          else dayData.expense += Number(t.amount);
        }
      }
    });

    return days;
  }, [validTransactions]);

  const currentWeekStats = useMemo(() => {
    return getWeeklyData.reduce((acc, day) => {
      acc.income += day.income;
      acc.expense += day.expense;
      return acc;
    }, { income: 0, expense: 0 });
  }, [getWeeklyData]);

  const getCategoryData = useMemo(() => {
    const cats: any = {};
    validTransactions.filter(t => t.type === 'expense').forEach(t => {
      cats[t.category] = (cats[t.category] || 0) + Number(t.amount);
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value: Number(value) }));
  }, [validTransactions]);

  useEffect(() => {
    if (!isLoggedIn || validTransactions.length === 0) return;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Find the oldest unarchived transaction from a previous month
    const previousMonthTxs = validTransactions.filter(t => {
      const tDate = new Date(t.date);
      return tDate.getFullYear() < currentYear || (tDate.getFullYear() === currentYear && tDate.getMonth() < currentMonth);
    });

    if (previousMonthTxs.length > 0) {
      // Group by month/year to find the oldest one
      const oldestTx = previousMonthTxs.reduce((oldest, t) => {
        const tDate = new Date(t.date);
        const oldestDate = new Date(oldest.date);
        return tDate < oldestDate ? t : oldest;
      });
      const oldestDate = new Date(oldestTx.date);
      const targetMonth = oldestDate.getMonth();
      const targetYear = oldestDate.getFullYear();

      const reportKey = `monthly-${targetYear}-${targetMonth}`;
      if (snoozedMonthlyReportKey === reportKey) {
        return;
      }

      const txsToArchive = previousMonthTxs.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === targetMonth && d.getFullYear() === targetYear;
      });

      setMonthlyReportReady({ month: targetMonth, year: targetYear, transactions: txsToArchive });
    } else {
      setMonthlyReportReady(null);
    }
  }, [validTransactions, isLoggedIn, snoozedMonthlyReportKey]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoggingInRef.current) return;
    
    if (!emailInput || !passwordInput) {
      setToast({ message: 'Por favor ingresa correo y contraseña', type: 'error' });
      return;
    }

    isLoggingInRef.current = true;
    setIsLoggingIn(true);

    try {
      if (authMode === 'email_register') {
        const userCredential = await createUserWithEmailAndPassword(auth, emailInput, passwordInput);
        const userRef = doc(db, 'users', userCredential.user.uid);
        await setDoc(userRef, {
          uid: userCredential.user.uid,
          role: 'user',
          business_name: 'Markez Tapicería',
          address: '',
          phone: '',
          logo_url: '',
          use_whatsapp_business: false
        });
      } else {
        await signInWithEmailAndPassword(auth, emailInput, passwordInput);
      }
    } catch (err: any) {
      console.error("Email auth error:", err);
      let errorMessage = 'Error de autenticación';
      if (err.code === 'auth/email-already-in-use') errorMessage = 'El correo ya está registrado.';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') errorMessage = 'Correo o contraseña incorrectos.';
      if (err.code === 'auth/weak-password') errorMessage = 'La contraseña debe tener al menos 6 caracteres.';
      
      setToast({ message: errorMessage, type: 'error' });
      setTimeout(() => setToast(null), 5000);
    } finally {
      isLoggingInRef.current = false;
      setIsLoggingIn(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoggingInRef.current) return;
    
    isLoggingInRef.current = true;
    setIsLoggingIn(true);
    
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      
      const isIframe = window.self !== window.top;
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
      
      if (!isIframe && (isMobile || isStandalone)) {
        // Use redirect for mobile PWAs and WebViews (like WebIntoApp)
        await signInWithRedirect(auth, provider);
        // Code below won't execute because the page redirects
      } else {
        // Use popup for desktop and iframes
        await signInWithPopup(auth, provider);
        // Ensure user document exists
        if (auth.currentUser) {
          const userRef = doc(db, 'users', auth.currentUser.uid);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              uid: auth.currentUser.uid,
              role: 'user',
              business_name: 'Markez Tapicería',
              address: '',
              phone: '',
              logo_url: '',
              use_whatsapp_business: false
            });
          }
        }
      }
    } catch (err: any) {
      console.error("Login error:", err);
      let errorMessage = 'Error al iniciar sesión';
      if (err.code === 'auth/popup-blocked') {
        errorMessage = 'Por favor, permite las ventanas emergentes (popups) para iniciar sesión.';
      } else if (err.message && err.message.includes('INTERNAL ASSERTION FAILED')) {
        errorMessage = 'Error interno de autenticación. Por favor, recarga la página e intenta de nuevo.';
      }
      setToast({ message: errorMessage, type: 'error' });
      setTimeout(() => setToast(null), 5000);
    } finally {
      isLoggingInRef.current = false;
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err: any) {
      setToast({ message: err.message || 'Error al cerrar sesión', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  const generateInsights = useCallback(async () => {
    if (validTransactions.length === 0) return;
    setIsGeneratingInsights(true);
    try {
      const apiKey = (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) || import.meta.env.VITE_GEMINI_API_KEY;

      if (!apiKey || apiKey === "undefined" || apiKey === "null" || apiKey.trim() === "") {
        setInsights("La Inteligencia Artificial no está disponible en este momento (Falta configurar la API Key en Vercel).");
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      const recentTrans = validTransactions.slice(0, 20).map(t => `${t.date}: ${t.concept} (${t.type === 'income' ? '+' : '-'}${t.amount})`).join('\n');
      
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
  }, [validTransactions]);

  const sendMessageToMax = async (message: string) => {
    if (!auth.currentUser || !message.trim()) return;
    setIsSendingMessage(true);
    try {
      const apiKey = (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) || import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey || apiKey === "undefined" || apiKey === "null" || apiKey.trim() === "") {
        setToast({ message: "La IA no está configurada (Falta API Key en Vercel).", type: 'error' });
        return;
      }

      const userId = auth.currentUser.uid;
      const userMsg = { role: 'user', text: message, timestamp: (new Date()).toISOString() };
      await addDoc(collection(db, `users/${userId}/financial_chat`), userMsg);

      const ai = new GoogleGenAI({ apiKey });
      
      // Build context
      const recentTrans = validTransactions.slice(0, 20).map(t => `${t.date}: ${t.concept} (${t.type === 'income' ? '+' : '-'}${t.amount})`).join('\n');
      const recentOrders = orders.filter(o => !o.is_canceled && !o.archived).slice(0, 10).map(o => `${o.work_type} - ${o.status} - Total: ${o.total}`).join('\n');
      
      const systemInstruction = `Eres Max, un asesor financiero experto y amigable para un negocio de tapicería.
      Tu objetivo es dar consejos financieros, analizar gastos y ayudar a mejorar la rentabilidad basándote en los datos del negocio.
      
      Datos recientes del negocio:
      Transacciones:
      ${recentTrans}
      
      Últimos pedidos:
      ${recentOrders}
      
      Responde de manera concisa, útil y motivadora.`;

      const recentMessages = chatMessages.slice(-20);
      const conversationHistory = recentMessages.map(msg => `${msg.role === 'model' ? 'Max' : 'Usuario'}: ${msg.text}`).join('\n\n');
      
      const prompt = `Historial de conversación:
${conversationHistory}

Usuario: ${message}`;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { systemInstruction }
      });

      const aiMsg = { role: 'model', text: result.text || "No pude procesar tu solicitud.", timestamp: (new Date()).toISOString() };
      await addDoc(collection(db, `users/${userId}/financial_chat`), aiMsg);

    } catch (err: any) {
      console.error("Error sending message to Max:", err);
      let errorMessage = "Error al enviar mensaje a Max.";
      const rawError = err.message || "";
      
      if (rawError.includes("quota") || rawError.includes("429") || rawError.includes("rate-limits")) {
        errorMessage = "Límite de mensajes rápidos alcanzado. Por favor, espera 1 minuto para que Max descanse.";
      } else {
        errorMessage = rawError.length > 100 ? "Error de conexión con la IA. Intenta de nuevo." : rawError;
      }
      
      setToast({ message: errorMessage, type: 'error' });
      setTimeout(() => setToast(null), 6000);
    } finally {
      setIsSendingMessage(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn && transactions.length > 0 && !insights) {
      generateInsights();
    }
  }, [isLoggedIn, transactions.length, insights, generateInsights]);

  // --- Notifications ---
  const sendAppNotification = async (title: string, options: any) => {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        if (registrations.length > 0 && registrations[0].showNotification) {
          await registrations[0].showNotification(title, options);
          return;
        }
      }
      new Notification(title, options);
    } catch (e) {
      console.error("Error sending notification:", e);
    }
  };

  useEffect(() => {
    if (!isLoggedIn) return;

    // Request permission if not already granted or denied
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const checkAndSendDailyNotification = () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;

      const now = new Date();
      if (now.getHours() >= 10) {
        const todayStr = format(now, 'yyyy-MM-dd');
        const lastNotified = localStorage.getItem('lastDailyNotification');

        if (lastNotified !== todayStr) {
          const todayOrders = orders.filter(o => {
            if (o.status !== 'pending' || o.is_quote || o.is_canceled || o.archived) return false;
            try {
              let orderDate: Date;
              if (typeof o.delivery_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.delivery_date)) {
                const [year, month, d] = o.delivery_date.split('-');
                orderDate = new Date(Number(year), Number(month) - 1, Number(d));
              } else {
                orderDate = new Date(o.delivery_date);
              }
              return isSameDay(orderDate, now);
            } catch (e) {
              return false;
            }
          });

          if (todayOrders.length > 0) {
            sendAppNotification('Entregas Pendientes Hoy', {
              body: `Tienes ${todayOrders.length} pedido(s) para entregar el día de hoy.`,
              icon: '/vite.svg'
            });
          }
          localStorage.setItem('lastDailyNotification', todayStr);
        }
      }
    };

    // Check immediately and then every minute
    checkAndSendDailyNotification();
    const interval = setInterval(checkAndSendDailyNotification, 60000);
    return () => clearInterval(interval);
  }, [isLoggedIn, orders]);

  // Monthly Report Notification
  useEffect(() => {
    if (monthlyReportReady && 'Notification' in window && Notification.permission === 'granted') {
      const reportKey = `monthly-${monthlyReportReady.year}-${monthlyReportReady.month}`;
      const lastReportNotified = localStorage.getItem('lastReportNotification');
      
      if (lastReportNotified !== reportKey) {
        sendAppNotification('Resumen Mensual Listo', {
          body: `Tu resumen financiero de ${format(new Date(monthlyReportReady.year, monthlyReportReady.month), 'MMMM yyyy', { locale: es })} está listo.`,
          icon: '/vite.svg'
        });
        localStorage.setItem('lastReportNotification', reportKey);
      }
    }
  }, [monthlyReportReady]);

  // Weekly Report (Insights) Notification
  useEffect(() => {
    if (insights && !insights.startsWith("La Inteligencia") && !insights.startsWith("Error") && 'Notification' in window && Notification.permission === 'granted') {
      // Create a key for the current week to only notify once per week
      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekKey = `weekly-${format(weekStart, 'yyyy-MM-dd')}`;
      const lastWeeklyNotified = localStorage.getItem('lastWeeklyNotification');

      if (lastWeeklyNotified !== weekKey) {
        sendAppNotification('Resumen Semanal Listo', {
          body: 'Tu análisis financiero semanal generado por IA está disponible.',
          icon: '/vite.svg'
        });
        localStorage.setItem('lastWeeklyNotification', weekKey);
      }
    }
  }, [insights]);

  // Weekly PDF Report Check (Saturdays 3:00 PM)
  useEffect(() => {
    if (!isLoggedIn || (!validTransactions.length && !orders.length)) return;

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    
    // ONLY activate on Saturdays after 3:00 PM
    const isCutoffTime = dayOfWeek === 6 && now.getHours() >= 15;
    
    if (!isCutoffTime) {
      if (weeklyReportReady) setWeeklyReportReady(null);
      return;
    }

    let lastCutoff = new Date(now);
    lastCutoff.setHours(15, 0, 0, 0);

    const cutoffKey = `weekly-pdf-${lastCutoff.toISOString()}`;
    const lastDownloaded = localStorage.getItem('lastWeeklyPdfDownloaded');

    if (lastDownloaded !== cutoffKey && snoozedWeeklyReportKey !== cutoffKey) {
      const startDate = new Date(lastCutoff);
      startDate.setDate(startDate.getDate() - 7);

      const weekTxs = validTransactions.filter(t => {
        const d = new Date(t.date);
        return d > startDate && d <= lastCutoff;
      });

      const weekOrders = orders.filter(o => {
        if (o.is_quote || o.is_canceled || o.archived) return false;
        try {
          let orderDate: Date;
          if (typeof o.delivery_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.delivery_date)) {
            const [year, month, d] = o.delivery_date.split('-');
            orderDate = new Date(Number(year), Number(month) - 1, Number(d));
          } else {
            orderDate = new Date(o.delivery_date);
          }
          return orderDate > startDate && orderDate <= lastCutoff;
        } catch (e) {
          return false;
        }
      });

      setWeeklyReportReady({
        startDate,
        endDate: lastCutoff,
        transactions: weekTxs,
        orders: weekOrders,
        cutoffKey
      });
    }
  }, [validTransactions, orders, isLoggedIn, snoozedWeeklyReportKey]);

  // --- Handlers ---
  const handleDownloadWeeklyReport = () => {
    if (!weeklyReportReady) return;
    const { startDate, endDate, transactions, orders, cutoffKey } = weeklyReportReady;
    
    const doc = new jsPDF();
    
    // Colors
    const primaryColor = [220, 38, 38]; // Red
    const darkColor = [26, 26, 26];
    const incomeColor = [16, 185, 129]; // Emerald
    const expenseColor = [239, 68, 68]; // Red
    const grayColor = [100, 100, 100];
    const lightGray = [240, 240, 240];

    // Header
    doc.setFillColor(darkColor[0], darkColor[1], darkColor[2]);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Reporte Semanal', 14, 22);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Corte de caja: ${format(startDate, 'dd/MM/yyyy HH:mm')} al ${format(endDate, 'dd/MM/yyyy HH:mm')}`, 14, 32);
    
    let currentY = 50;
    
    // Resumen Financiero
    const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);
    const balance = income - expense;
    
    // Draw 3 boxes for stats
    const boxWidth = 55;
    const boxHeight = 25;
    const startX = 14;
    const gap = 10;

    // Income Box
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.roundedRect(startX, currentY, boxWidth, boxHeight, 3, 3, 'F');
    doc.setTextColor(incomeColor[0], incomeColor[1], incomeColor[2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('INGRESOS', startX + 5, currentY + 8);
    doc.setFontSize(14);
    doc.text(`$${income.toFixed(2)}`, startX + 5, currentY + 18);

    // Expense Box
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.roundedRect(startX + boxWidth + gap, currentY, boxWidth, boxHeight, 3, 3, 'F');
    doc.setTextColor(expenseColor[0], expenseColor[1], expenseColor[2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('GASTOS', startX + boxWidth + gap + 5, currentY + 8);
    doc.setFontSize(14);
    doc.text(`$${expense.toFixed(2)}`, startX + boxWidth + gap + 5, currentY + 18);

    // Balance Box
    doc.setFillColor(darkColor[0], darkColor[1], darkColor[2]);
    doc.roundedRect(startX + (boxWidth + gap) * 2, currentY, boxWidth, boxHeight, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('BALANCE NETO', startX + (boxWidth + gap) * 2 + 5, currentY + 8);
    doc.setFontSize(14);
    doc.text(`$${balance.toFixed(2)}`, startX + (boxWidth + gap) * 2 + 5, currentY + 18);

    currentY += boxHeight + 15;

    // Max Insights
    doc.setFillColor(255, 241, 242); // rose-50
    doc.setDrawColor(225, 29, 72); // rose-600
    doc.roundedRect(14, currentY, 180, 25, 3, 3, 'FD');
    doc.setTextColor(225, 29, 72);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('💡 Max (Tu Asistente IA) dice:', 18, currentY + 8);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    let insightText = '';
    if (balance > 0) {
      insightText = `¡Excelente semana! Lograste una utilidad de $${balance.toFixed(2)}. Mantener los gastos controlados te permitió un margen positivo.`;
    } else {
      insightText = `Esta semana los gastos superaron los ingresos por $${Math.abs(balance).toFixed(2)}. Revisa el desglose de gastos para identificar fugas de capital.`;
    }
    doc.text(insightText, 18, currentY + 16, { maxWidth: 170 });
    
    currentY += 35;

    // Bar Chart
    doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Comparativa de Ingresos vs Gastos', 14, currentY);
    currentY += 10;

    const chartWidth = 180;
    const chartHeight = 40;
    const maxVal = Math.max(income, expense, 1); // Avoid division by zero
    
    // Draw chart background
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.rect(14, currentY, chartWidth, chartHeight, 'F');

    // Draw bars
    const incomeBarWidth = (income / maxVal) * (chartWidth - 20);
    const expenseBarWidth = (expense / maxVal) * (chartWidth - 20);

    // Income bar
    doc.setFillColor(incomeColor[0], incomeColor[1], incomeColor[2]);
    doc.rect(14 + 10, currentY + 8, incomeBarWidth, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    if (incomeBarWidth > 20) {
      doc.text(`$${income.toFixed(2)}`, 14 + 12, currentY + 15);
    }

    // Expense bar
    doc.setFillColor(expenseColor[0], expenseColor[1], expenseColor[2]);
    doc.rect(14 + 10, currentY + 22, expenseBarWidth, 10, 'F');
    doc.setTextColor(255, 255, 255);
    if (expenseBarWidth > 20) {
      doc.text(`$${expense.toFixed(2)}`, 14 + 12, currentY + 29);
    }

    currentY += chartHeight + 15;
    
    // Transacciones Table
    if (transactions.length > 0) {
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Transacciones de la Semana', 14, currentY);
      currentY += 5;
      autoTable(doc, {
        startY: currentY,
        head: [['Fecha', 'Concepto', 'Tipo', 'Monto']],
        body: transactions.map(t => [
          format(new Date(t.date), 'dd/MM/yyyy'),
          t.concept,
          t.type === 'income' ? 'Ingreso' : 'Egreso',
          `$${Number(t.amount).toFixed(2)}`
        ]),
        theme: 'striped',
        headStyles: { fillColor: darkColor as any },
        alternateRowStyles: { fillColor: lightGray as any }
      });
      currentY = (doc as any).lastAutoTable.finalY + 15;
    }
    
    // Pedidos Table
    if (orders.length > 0) {
      if (currentY > 250) { doc.addPage(); currentY = 20; }
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Pedidos Entregados / Programados', 14, currentY);
      currentY += 5;
      autoTable(doc, {
        startY: currentY,
        head: [['Cliente', 'Trabajo', 'Estado', 'Total', 'Pagado']],
        body: orders.map(o => [
          o.customer_name,
          o.work_type,
          o.status === 'completed' ? 'Completado' : 'Pendiente',
          `$${Number(o.total).toFixed(2)}`,
          `$${Number(o.advance).toFixed(2)}`
        ]),
        theme: 'striped',
        headStyles: { fillColor: primaryColor as any },
        alternateRowStyles: { fillColor: lightGray as any }
      });
    }
    
    // Presentation Page
    doc.addPage();
    doc.setFillColor(darkColor[0], darkColor[1], darkColor[2]);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Presentación de Resultados', 14, 22);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Análisis y Estadísticas por Max IA', 14, 32);

    let py = 50;
    
    // Stats
    const totalOrders = orders.length;
    const completedOrders = orders.filter(o => o.status === 'completed').length;
    const pendingOrders = totalOrders - completedOrders;
    const avgTicket = totalOrders > 0 ? (orders.reduce((sum, o) => sum + Number(o.total), 0) / totalOrders) : 0;
    
    const expenseCategories = transactions.filter(t => t.type === 'expense').reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + Number(t.amount);
      return acc;
    }, {} as Record<string, number>);
    const topExpenseCategory = Object.entries(expenseCategories).sort((a, b) => b[1] - a[1])[0];

    // Presentation Boxes
    const pBoxWidth = 85;
    const pBoxHeight = 35;
    const pStartX = 14;
    const pGap = 12;

    // Box 1: Orders
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.roundedRect(pStartX, py, pBoxWidth, pBoxHeight, 3, 3, 'F');
    doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Pedidos de la Semana', pStartX + 5, py + 10);
    doc.setFontSize(20);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(`${totalOrders}`, pStartX + 5, py + 22);
    doc.setFontSize(9);
    doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
    doc.setFont('helvetica', 'normal');
    doc.text(`${completedOrders} completados, ${pendingOrders} pendientes`, pStartX + 5, py + 30);

    // Box 2: Avg Ticket
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.roundedRect(pStartX + pBoxWidth + pGap, py, pBoxWidth, pBoxHeight, 3, 3, 'F');
    doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Ticket Promedio', pStartX + pBoxWidth + pGap + 5, py + 10);
    doc.setFontSize(20);
    doc.setTextColor(incomeColor[0], incomeColor[1], incomeColor[2]);
    doc.text(`$${avgTicket.toFixed(2)}`, pStartX + pBoxWidth + pGap + 5, py + 22);
    doc.setFontSize(9);
    doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
    doc.setFont('helvetica', 'normal');
    doc.text('Por pedido registrado', pStartX + pBoxWidth + pGap + 5, py + 30);

    py += pBoxHeight + pGap;

    // Box 3: Top Expense
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.roundedRect(pStartX, py, pBoxWidth, pBoxHeight, 3, 3, 'F');
    doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Mayor Gasto', pStartX + 5, py + 10);
    doc.setFontSize(14);
    doc.setTextColor(expenseColor[0], expenseColor[1], expenseColor[2]);
    doc.text(topExpenseCategory ? topExpenseCategory[0] : 'N/A', pStartX + 5, py + 20);
    doc.setFontSize(12);
    doc.text(topExpenseCategory ? `$${topExpenseCategory[1].toFixed(2)}` : '$0.00', pStartX + 5, py + 28);

    // Box 4: Max's Tip
    doc.setFillColor(255, 241, 242); // rose-50
    doc.setDrawColor(225, 29, 72); // rose-600
    doc.roundedRect(pStartX + pBoxWidth + pGap, py, pBoxWidth, pBoxHeight, 3, 3, 'FD');
    doc.setTextColor(225, 29, 72);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('💡 Tip de Max', pStartX + pBoxWidth + pGap + 5, py + 10);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    let tipText = '';
    if (balance > 0 && expense > 0) {
      tipText = `Buen trabajo manteniendo rentabilidad. Tu mayor gasto fue ${topExpenseCategory ? topExpenseCategory[0] : ''}. Intenta optimizarlo la próxima semana.`;
    } else if (balance <= 0) {
      tipText = `Cuidado con los gastos. ${topExpenseCategory ? `Especialmente en ${topExpenseCategory[0]}` : ''}. Revisa si son necesarios o si puedes reducirlos.`;
    } else {
      tipText = `¡Semana perfecta! Sigue así, registrando todos tus movimientos para mantener el control.`;
    }
    doc.text(tipText, pStartX + pBoxWidth + pGap + 5, py + 18, { maxWidth: pBoxWidth - 10 });

    doc.save(`Reporte_Semanal_${format(endDate, 'yyyy-MM-dd')}.pdf`);
    
    // Mark as downloaded
    localStorage.setItem('lastWeeklyPdfDownloaded', cutoffKey);
    setWeeklyReportReady(null);
    
    setToast({ message: 'Reporte descargado exitosamente', type: 'success' });
    setTimeout(() => setToast(null), 3000);
  };

  const handleDownloadAndSharePDF = async (order: Order) => {
    try {
      const isQuote = order.is_quote;
      const doc = new jsPDF();
      
      // Colors
      const primaryColor = [220, 38, 38]; // Red
      const darkColor = [26, 26, 26];
      const grayColor = [100, 100, 100];
      const lightGray = [240, 240, 240];

      // Header Background
      doc.setFillColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.rect(0, 0, 210, 40, 'F');

      // Add logo if exists
      if (profile.logo_url) {
        try {
          // Add watermark logo in the center
          doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
          doc.addImage(profile.logo_url, 30, 73.5, 150, 150);
          doc.setGState(new (doc as any).GState({ opacity: 1.0 }));

          // Add top-left logo
          // jsPDF can infer the format from the data URL
          doc.addImage(profile.logo_url, 15, 5, 30, 30);
        } catch (e) {
          console.error("Could not add logo to PDF", e);
        }
      }

      // Business Info (Header)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(24);
      doc.setTextColor(255, 255, 255);
      doc.text(profile.business_name || 'Tapicería', profile.logo_url ? 55 : 15, 20);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(200, 200, 200);
      doc.text(profile.address || '', profile.logo_url ? 55 : 15, 28);
      doc.text(`Tel: ${profile.phone || ''}`, profile.logo_url ? 55 : 15, 34);

      // Receipt Info
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.setTextColor(200, 200, 200);
      doc.text(`Folio: #${order.id.toString().padStart(6, '0')}`, 195, 28, { align: 'right' });
      doc.text(`Fecha: ${format(new Date(), 'dd/MM/yyyy')}`, 195, 34, { align: 'right' });

      // Customer Info Section
      doc.setFillColor(0, 0, 0);
      doc.rect(15, 50, 180, 10, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text('DATOS DEL CLIENTE', 20, 57);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
      doc.text(`Nombre:`, 20, 70);
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.text(order.customer_name, 45, 70);

      doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
      doc.text(`Teléfono:`, 20, 78);
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.text(order.phone, 45, 78);

      doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
      doc.text(`Dirección:`, 20, 86);
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.text(order.address || 'No especificada', 45, 86);

      // Order Details Section
      doc.setFillColor(0, 0, 0);
      doc.rect(15, 100, 180, 10, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text('DETALLES DEL TRABAJO', 20, 107);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
      doc.text(`Trabajo:`, 20, 120);
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.text(order.work_type, 60, 120);

      doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
      doc.text(`Material:`, 20, 128);
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.text(order.material, 60, 128);

      doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
      doc.text(`Fecha de Entrega:`, 20, 136);
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.text(safeFormatDate(order.delivery_date, 'dd/MM/yyyy'), 60, 136);

      let currentY = 146;

      if (order.description) {
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        doc.text(`Descripción:`, 20, currentY);
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        const splitDescription = doc.splitTextToSize(order.description, 130);
        doc.text(splitDescription, 60, currentY);
        currentY += (splitDescription.length * 5) + 5;
      }

      // Financials Section
      doc.setFillColor(0, 0, 0);
      doc.rect(15, currentY, 180, 10, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text(isQuote ? 'COTIZACIÓN' : 'RESUMEN ECONÓMICO', 20, currentY + 7);
      
      const formatCurrency = (amount: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
      doc.text(`Total:`, 130, currentY + 25);
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.text(formatCurrency(order.total), 185, currentY + 25, { align: 'right' });
      
      if (!isQuote) {
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        doc.text(`Anticipo/Abonos:`, 130, currentY + 35);
        doc.setTextColor(34, 197, 94); // Emerald 500
        doc.text(formatCurrency(order.advance), 185, currentY + 35, { align: 'right' });
        
        doc.setDrawColor(200, 200, 200);
        doc.line(130, currentY + 40, 185, currentY + 40);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.text(isQuote ? `Total Cotizado:` : `Restante:`, 130, currentY + 50);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(formatCurrency(isQuote ? order.total : order.total - order.advance), 185, currentY + 50, { align: 'right' });

      // Footer
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(150, 150, 150);
      doc.text('¡Gracias por su preferencia!', 105, 270, { align: 'center' });
      doc.text(isQuote ? 'Esta cotización tiene una vigencia de 15 días.' : 'Este documento es un comprobante de su pedido.', 105, 275, { align: 'center' });

      // Generate file name
      const fileName = `${isQuote ? 'Cotizacion' : 'Nota_Remision'}_${order.customer_name.replace(/\s+/g, '_')}.pdf`;

      // 1. Try Web Share API first (Best for Android WebViews)
      try {
        const pdfBlob = doc.output('blob');
        const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: isQuote ? 'Cotización' : 'Nota de Remisión',
            text: isQuote ? `Estimado/a ${order.customer_name}, le compartimos la cotización solicitada.` : `Estimado/a ${order.customer_name}, le compartimos su nota de remisión.`,
          });
          setToast({ message: 'Documento compartido exitosamente', type: 'success' });
          setTimeout(() => setToast(null), 3000);
          return; // Stop here if share was successful
        }
      } catch (shareError: any) {
        if (shareError.name === 'AbortError' || (shareError.message && shareError.message.includes('canceled'))) {
          return; // User manually canceled the share sheet
        }
        console.error("Error sharing via Web Share API:", shareError);
      }

      // 2. Fallback: Try Base64 Download (Works better in some WebViews than Blob)
      try {
        const base64URI = doc.output('datauristring');
        const link = document.createElement('a');
        link.href = base64URI;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setToast({ message: 'Descargando documento...', type: 'success' });
        setTimeout(() => setToast(null), 3000);
      } catch (fallbackError) {
        console.error("Base64 download failed, trying standard save:", fallbackError);
        // 3. Final Fallback: Standard jsPDF save
        doc.save(fileName);
      }
    } catch (error) {
      console.error("Error generating PDF:", error);
      setToast({ message: "Hubo un error al generar el PDF.", type: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(formData.entries());
    
    const advanceAmount = Number(data.advance);
    const isQuote = orderModalType === 'quote';
    const workType = data.work_type as string;
    
    const executeOrderCreation = async (hasWarning = false) => {
      try {
        const orderData = {
          ...data,
          uid: auth.currentUser!.uid,
          total: Number(data.total),
          advance: advanceAmount,
          status: 'pending',
          registration_date: (new Date()).toISOString(),
          is_quote: isQuote
        };
        
        const orderRef = await addDoc(collection(db, `users/${auth.currentUser!.uid}/orders`), orderData);
        
        if (!isQuote && advanceAmount > 0) {
          const txData = {
            type: 'income',
            amount: advanceAmount,
            concept: `Anticipo de pedido: ${data.customer_name}`,
            date: (new Date()).toISOString(),
            uid: auth.currentUser!.uid,
            order_id: orderRef.id,
            category: 'Ventas'
          };
          await addDoc(collection(db, `users/${auth.currentUser!.uid}/transactions`), txData);
        }
        
        // If we were converting a quote, delete the original quote
        if (quoteToConvert && orderModalType === 'order') {
          await deleteDoc(doc(db, `users/${auth.currentUser!.uid}/orders`, quoteToConvert.id));
        }

        setIsOrderModalOpen(false);
        setQuoteToConvert(null);
        
        if (hasWarning) {
          setToast({ 
            message: `Pedido creado. Aviso: Has superado el límite de capacidad para "${workType}".`, 
            type: 'warning' 
          });
          setTimeout(() => setToast(null), 6000);
        } else {
          setToast({ message: orderModalType === 'quote' ? 'Cotización creada con éxito' : 'Pedido creado con éxito', type: 'success' });
          setTimeout(() => setToast(null), 3000);
        }
      } catch (err: any) {
        handleFirestoreError(err, OperationType.CREATE, `users/${auth.currentUser?.uid}/orders`);
      }
    };

    const limitObj = limits.find(l => l.work_type === workType);
    let hasWarning = false;
    if (limitObj && !isQuote) {
      const currentPending = orders.filter(o => o.status === 'pending' && !o.is_quote && !o.is_canceled && !o.archived && o.work_type === workType).length;
      if (currentPending >= limitObj.limit_val) {
        hasWarning = true;
      }
    }

    executeOrderCreation(hasWarning);
  };

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(formData.entries());
    
    try {
      const txData = {
        ...data,
        uid: auth.currentUser.uid,
        date: (new Date()).toISOString(),
        amount: Number(data.amount)
      };
      await addDoc(collection(db, `users/${auth.currentUser.uid}/transactions`), txData);
      setIsTransactionModalOpen(false);
      setToast({ message: 'Transacción registrada', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, `users/${auth.currentUser?.uid}/transactions`);
    }
  };

  const handleCompleteOrder = async (id: string) => {
    if (!auth.currentUser) return;
    try {
      const order = orders.find(o => o.id === id);
      if (!order) return;

      const remaining = Number(order.total) - Number(order.advance);
      
      await updateDoc(doc(db, `users/${auth.currentUser.uid}/orders`, id), { 
        status: 'completed',
        advance: Number(order.total),
        total: Number(order.total)
      });
      
      if (remaining > 0) {
        const txData = {
          type: 'income',
          amount: remaining,
          concept: `Liquidación de pedido: ${order.customer_name}`,
          date: (new Date()).toISOString(),
          uid: auth.currentUser.uid,
          order_id: id,
          category: 'Ventas'
        };
        await addDoc(collection(db, `users/${auth.currentUser.uid}/transactions`), txData);
      }

      setSelectedOrderDetails(null);
      setToast({ message: 'Pedido completado y liquidado', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${auth.currentUser?.uid}/orders/${id}`);
    }
  };

  const handleDeleteOrder = async () => {
    if (!orderToDelete || !auth.currentUser) return;
    try {
      // Mark order as canceled
      await updateDoc(doc(db, `users/${auth.currentUser.uid}/orders`, orderToDelete), {
        is_canceled: true
      });
      
      // Find all transactions related to this order and mark them as canceled
      const relatedTxs = transactions.filter(t => t.order_id === orderToDelete);
      for (const tx of relatedTxs) {
        await updateDoc(doc(db, `users/${auth.currentUser.uid}/transactions`, tx.id), {
          is_canceled: true
        });
      }

      setOrderToDelete(null);
      setPasswordPrompt({ isOpen: false, action: '', passwordInput: '', newPasswordInput: '' });
      setSelectedOrderDetails(null);
      setToast({ message: 'Pedido cancelado', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${auth.currentUser?.uid}/orders/${orderToDelete}`);
    }
  };

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModal.orderId || !auth.currentUser) return;
    try {
      const orderRef = doc(db, `users/${auth.currentUser.uid}/orders`, paymentModal.orderId);
      const orderSnap = await getDoc(orderRef);
      if (orderSnap.exists()) {
        const currentAdvance = Number(orderSnap.data().advance) || 0;
        const paymentAmount = Number(paymentModal.amount);
        await updateDoc(orderRef, { 
          advance: currentAdvance + paymentAmount,
          total: Number(orderSnap.data().total)
        });
        
        const txData = {
          type: 'income',
          amount: paymentAmount,
          concept: `Abono a pedido: ${orderSnap.data().customer_name}`,
          date: (new Date()).toISOString(),
          uid: auth.currentUser.uid,
          order_id: orderSnap.id,
          category: 'Ventas'
        };
        await addDoc(collection(db, `users/${auth.currentUser.uid}/transactions`), txData);

        setPaymentModal({ isOpen: false, orderId: null, amount: '' });
        setSelectedOrderDetails(null);
        setToast({ message: 'Abono registrado con éxito', type: 'success' });
        setTimeout(() => setToast(null), 3000);
      }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${auth.currentUser?.uid}/orders/${paymentModal.orderId}`);
    }
  };

  const handleExportJSON = () => {
    const data = {
      orders,
      transactions,
      profile,
      customLimits: limits.reduce((acc, l) => ({ ...acc, [l.work_type]: l.limit_val }), {}),
      exportDate: (new Date()).toISOString()
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
    if (!file || !auth.currentUser) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      const userId = auth.currentUser.uid;
      
      if (data.profile) {
        await setDoc(doc(db, 'users', userId), { ...data.profile, uid: userId }, { merge: true });
      }
      
      if (data.orders) {
        for (const order of data.orders) {
          await setDoc(doc(db, `users/${userId}/orders`, String(order.id)), { ...order, uid: userId });
        }
      }
      
      if (data.transactions) {
        for (const tx of data.transactions) {
          await setDoc(doc(db, `users/${userId}/transactions`, String(tx.id)), { ...tx, uid: userId });
        }
      }
      
      if (data.customLimits) {
        for (const [work_type, limit_val] of Object.entries(data.customLimits)) {
          await addDoc(collection(db, `users/${userId}/limits`), { work_type, limit_val, uid: userId });
        }
      }
      
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
    // This is a placeholder since we use Google Auth
    setToast({ message: 'El cambio de contraseña se gestiona a través de Google', type: 'success' });
    setTimeout(() => setToast(null), 3000);
    setPasswordPrompt({ isOpen: false, action: '', passwordInput: '', newPasswordInput: '' });
  };

  const handleEditOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder || !auth.currentUser) return;
    
    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(formData.entries());
    
    try {
      const newTotal = Number(data.total);
      const newAdvance = Number(data.advance);
      
      const orderRef = doc(db, `users/${auth.currentUser.uid}/orders`, editingOrder.id);
      
      await updateDoc(orderRef, {
        customer_name: data.customer_name,
        phone: data.phone,
        address: data.address,
        delivery_date: data.delivery_date,
        material: data.material,
        work_type: data.work_type,
        description: data.description,
        total: newTotal,
        advance: newAdvance
      });
      
      // If advance changed, try to update the initial transaction
      if (newAdvance !== editingOrder.advance) {
        const relatedTxs = transactions.filter(t => t.order_id === editingOrder.id && t.type === 'income');
        if (relatedTxs.length > 0) {
          // Assume the first transaction is the advance
          const firstTx = relatedTxs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
          await updateDoc(doc(db, `users/${auth.currentUser.uid}/transactions`, firstTx.id), {
            amount: newAdvance
          });
        } else if (newAdvance > 0) {
          // If no transaction exists but there is an advance now, create one
          const txData = {
            type: 'income',
            amount: newAdvance,
            concept: `Anticipo de pedido: ${data.customer_name}`,
            date: (new Date()).toISOString(),
            uid: auth.currentUser.uid,
            order_id: editingOrder.id,
            category: 'Ventas'
          };
          await addDoc(collection(db, `users/${auth.currentUser.uid}/transactions`), txData);
        }
      }

      setIsEditModalOpen(false);
      setEditingOrder(null);
      setSelectedOrderDetails(null); // Close details view if open to refresh
      setToast({ message: 'Pedido actualizado con éxito', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${auth.currentUser?.uid}/orders/${editingOrder.id}`);
    }
  };

  const handleArchiveMonth = async () => {
    if (!monthlyReportReady || !auth.currentUser) return;
    
    try {
      const { month, year, transactions: txsToArchive } = monthlyReportReady;
      const monthName = format(new Date(year, month), 'MMMM', { locale: es });
      
      // 1. Generate Excel (Historical)
      // We want all transactions up to the target month, grouped by month
      const allTxsUpToMonth = transactions.filter(t => {
        const d = new Date(t.date);
        return d.getFullYear() < year || (d.getFullYear() === year && d.getMonth() <= month);
      }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Group by YYYY-MM
      const groupedTxs: { [key: string]: Transaction[] } = {};
      allTxsUpToMonth.forEach(t => {
        const d = new Date(t.date);
        const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
        if (!groupedTxs[key]) groupedTxs[key] = [];
        groupedTxs[key].push(t);
      });

      const aoa: any[][] = [];
      
      // Sort keys chronologically
      const sortedKeys = Object.keys(groupedTxs).sort();
      
      for (const key of sortedKeys) {
        const [yStr, mStr] = key.split('-');
        const mName = format(new Date(Number(yStr), Number(mStr)), 'MMMM yyyy', { locale: es }).toUpperCase();
        
        aoa.push([`--- ${mName} ---`]);
        aoa.push(['Fecha', 'Concepto', 'Categoría', 'Tipo', 'Monto', 'ID_Pedido']);
        
        for (const t of groupedTxs[key]) {
          aoa.push([
            format(new Date(t.date), 'dd/MM/yyyy HH:mm'),
            t.concept,
            t.category,
            t.type === 'income' ? 'Ingreso' : 'Egreso',
            t.amount,
            t.order_id || 'N/A'
          ]);
        }
        aoa.push([]); // Empty row for separation
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Historial Transacciones');
      XLSX.writeFile(wb, `Historial_Financiero_hasta_${monthName}_${year}.xlsx`);

      // 2. Generate PDF Report
      const docPdf = new jsPDF();
      
      // Colors
      const primaryColor = [220, 38, 38]; // Red
      const darkColor = [26, 26, 26];
      const incomeColor = [16, 185, 129]; // Emerald
      const expenseColor = [239, 68, 68]; // Red
      const grayColor = [100, 100, 100];
      const lightGray = [240, 240, 240];

      // Header
      docPdf.setFillColor(darkColor[0], darkColor[1], darkColor[2]);
      docPdf.rect(0, 0, 210, 40, 'F');
      docPdf.setTextColor(255, 255, 255);
      docPdf.setFontSize(24);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text(`Corte Mensual: ${monthName.toUpperCase()} ${year}`, 14, 22);
      
      docPdf.setFontSize(10);
      docPdf.setFont('helvetica', 'normal');
      docPdf.text(`Generado el: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 32);
      
      let currentY = 50;
      
      // Summary Stats
      const totalIncome = txsToArchive.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0);
      const totalExpense = txsToArchive.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);
      const netIncome = totalIncome - totalExpense;
      
      // Draw 3 boxes for stats
      const boxWidth = 55;
      const boxHeight = 25;
      const startX = 14;
      const gap = 10;

      // Income Box
      docPdf.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
      docPdf.roundedRect(startX, currentY, boxWidth, boxHeight, 3, 3, 'F');
      docPdf.setTextColor(incomeColor[0], incomeColor[1], incomeColor[2]);
      docPdf.setFontSize(10);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text('INGRESOS', startX + 5, currentY + 8);
      docPdf.setFontSize(14);
      docPdf.text(`$${totalIncome.toFixed(2)}`, startX + 5, currentY + 18);

      // Expense Box
      docPdf.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
      docPdf.roundedRect(startX + boxWidth + gap, currentY, boxWidth, boxHeight, 3, 3, 'F');
      docPdf.setTextColor(expenseColor[0], expenseColor[1], expenseColor[2]);
      docPdf.setFontSize(10);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text('GASTOS', startX + boxWidth + gap + 5, currentY + 8);
      docPdf.setFontSize(14);
      docPdf.text(`$${totalExpense.toFixed(2)}`, startX + boxWidth + gap + 5, currentY + 18);

      // Balance Box
      docPdf.setFillColor(darkColor[0], darkColor[1], darkColor[2]);
      docPdf.roundedRect(startX + (boxWidth + gap) * 2, currentY, boxWidth, boxHeight, 3, 3, 'F');
      docPdf.setTextColor(255, 255, 255);
      docPdf.setFontSize(10);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text('BALANCE NETO', startX + (boxWidth + gap) * 2 + 5, currentY + 8);
      docPdf.setFontSize(14);
      docPdf.text(`$${netIncome.toFixed(2)}`, startX + (boxWidth + gap) * 2 + 5, currentY + 18);

      currentY += boxHeight + 15;

      // Max Insights
      docPdf.setFillColor(255, 241, 242); // rose-50
      docPdf.setDrawColor(225, 29, 72); // rose-600
      docPdf.roundedRect(14, currentY, 180, 25, 3, 3, 'FD');
      docPdf.setTextColor(225, 29, 72);
      docPdf.setFontSize(12);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text('💡 Max (Tu Asistente IA) dice:', 18, currentY + 8);
      docPdf.setTextColor(0, 0, 0);
      docPdf.setFontSize(10);
      docPdf.setFont('helvetica', 'normal');
      let insightText = '';
      if (netIncome > 0) {
        insightText = `¡Excelente mes! Lograste una utilidad de $${netIncome.toFixed(2)}. Mantener los gastos controlados te permitió un margen positivo.`;
      } else {
        insightText = `Este mes los gastos superaron los ingresos por $${Math.abs(netIncome).toFixed(2)}. Revisa la comparativa semanal para identificar fugas de capital.`;
      }
      docPdf.text(insightText, 18, currentY + 16, { maxWidth: 170 });
      
      currentY += 35;

      // Weekly Breakdown
      docPdf.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      docPdf.setFontSize(14);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text('Comparativa Semanal', 14, currentY);
      currentY += 8;

      // Calculate weekly data
      const weeks = [
        { name: 'Semana 1 (1-7)', income: 0, expense: 0 },
        { name: 'Semana 2 (8-14)', income: 0, expense: 0 },
        { name: 'Semana 3 (15-21)', income: 0, expense: 0 },
        { name: 'Semana 4 (22+)', income: 0, expense: 0 }
      ];

      txsToArchive.forEach(t => {
        const d = new Date(t.date).getDate();
        let wIdx = 0;
        if (d >= 8 && d <= 14) wIdx = 1;
        else if (d >= 15 && d <= 21) wIdx = 2;
        else if (d >= 22) wIdx = 3;
        
        if (t.type === 'income') weeks[wIdx].income += Number(t.amount);
        else weeks[wIdx].expense += Number(t.amount);
      });

      autoTable(docPdf, {
        startY: currentY,
        head: [['Semana', 'Ingresos', 'Gastos', 'Balance']],
        body: weeks.map(w => [
          w.name,
          `$${w.income.toFixed(2)}`,
          `$${w.expense.toFixed(2)}`,
          `$${(w.income - w.expense).toFixed(2)}`
        ]),
        theme: 'striped',
        headStyles: { fillColor: darkColor as any },
        alternateRowStyles: { fillColor: lightGray as any }
      });

      currentY = (docPdf as any).lastAutoTable.finalY + 15;

      // Weekly Bar Chart
      docPdf.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      docPdf.setFontSize(14);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text('Gráfica Semanal', 14, currentY);
      currentY += 10;

      const chartWidth = 180;
      const chartHeight = 40;
      const maxWeeklyVal = Math.max(...weeks.map(w => Math.max(w.income, w.expense)), 1);
      
      docPdf.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
      docPdf.rect(14, currentY, chartWidth, chartHeight, 'F');

      const barWidth = (chartWidth - 20) / 4; // 4 weeks
      const barGap = 5;
      const innerBarWidth = (barWidth - barGap) / 2;

      weeks.forEach((w, i) => {
        const x = 14 + 10 + i * barWidth;
        
        // Income bar
        const incHeight = (w.income / maxWeeklyVal) * (chartHeight - 10);
        docPdf.setFillColor(incomeColor[0], incomeColor[1], incomeColor[2]);
        docPdf.rect(x, currentY + chartHeight - incHeight, innerBarWidth, incHeight, 'F');
        
        // Expense bar
        const expHeight = (w.expense / maxWeeklyVal) * (chartHeight - 10);
        docPdf.setFillColor(expenseColor[0], expenseColor[1], expenseColor[2]);
        docPdf.rect(x + innerBarWidth, currentY + chartHeight - expHeight, innerBarWidth, expHeight, 'F');

        // Label
        docPdf.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        docPdf.setFontSize(8);
        docPdf.text(`S${i + 1}`, x + innerBarWidth / 2, currentY + chartHeight + 4);
      });

      // Legend
      docPdf.setFillColor(incomeColor[0], incomeColor[1], incomeColor[2]);
      docPdf.rect(14 + chartWidth - 40, currentY + 5, 4, 4, 'F');
      docPdf.setFontSize(8);
      docPdf.text('Ingresos', 14 + chartWidth - 34, currentY + 8);
      
      docPdf.setFillColor(expenseColor[0], expenseColor[1], expenseColor[2]);
      docPdf.rect(14 + chartWidth - 40, currentY + 12, 4, 4, 'F');
      docPdf.text('Gastos', 14 + chartWidth - 34, currentY + 15);

      currentY += chartHeight + 15;

      // Category Breakdown
      const cats: any = {};
      txsToArchive.filter(t => t.type === 'expense').forEach(t => {
        cats[t.category] = (cats[t.category] || 0) + Number(t.amount);
      });
      const catData = Object.entries(cats).map(([name, value]) => [name, `$${Number(value).toFixed(2)}`]);
      
      if (catData.length > 0) {
        if (currentY > 240) { docPdf.addPage(); currentY = 20; }
        docPdf.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        docPdf.setFontSize(14);
        docPdf.setFont('helvetica', 'bold');
        docPdf.text('Desglose de Egresos por Categoría', 14, currentY);
        currentY += 5;
        autoTable(docPdf, {
          startY: currentY,
          head: [['Categoría', 'Total']],
          body: catData,
          theme: 'striped',
        headStyles: { fillColor: expenseColor as any },
        alternateRowStyles: { fillColor: lightGray as any }
        });
      }

      // Presentation Page
      docPdf.addPage();
      docPdf.setFillColor(darkColor[0], darkColor[1], darkColor[2]);
      docPdf.rect(0, 0, 210, 40, 'F');
      docPdf.setTextColor(255, 255, 255);
      docPdf.setFontSize(24);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text('Presentación de Resultados', 14, 22);
      docPdf.setFontSize(10);
      docPdf.setFont('helvetica', 'normal');
      docPdf.text('Análisis y Estadísticas por Max IA', 14, 32);

      let py = 50;
      
      // Stats
      // We need to count orders completed in this month.
      const monthOrders = orders.filter(o => {
        const d = new Date(o.registration_date);
        return d.getFullYear() === year && d.getMonth() === month;
      });
      const totalOrders = monthOrders.length;
      const completedOrders = monthOrders.filter(o => o.status === 'completed').length;
      const pendingOrders = totalOrders - completedOrders;
      const avgTicket = totalOrders > 0 ? (monthOrders.reduce((sum, o) => sum + Number(o.total), 0) / totalOrders) : 0;
      
      const expenseCategories = txsToArchive.filter(t => t.type === 'expense').reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + Number(t.amount);
        return acc;
      }, {} as Record<string, number>);
      const topExpenseCategory = Object.entries(expenseCategories).sort((a, b) => b[1] - a[1])[0];

      // Presentation Boxes
      const pBoxWidth = 85;
      const pBoxHeight = 35;
      const pStartX = 14;
      const pGap = 12;

      // Box 1: Orders
      docPdf.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
      docPdf.roundedRect(pStartX, py, pBoxWidth, pBoxHeight, 3, 3, 'F');
      docPdf.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      docPdf.setFontSize(12);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text('Pedidos del Mes', pStartX + 5, py + 10);
      docPdf.setFontSize(20);
      docPdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      docPdf.text(`${totalOrders}`, pStartX + 5, py + 22);
      docPdf.setFontSize(9);
      docPdf.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
      docPdf.setFont('helvetica', 'normal');
      docPdf.text(`${completedOrders} completados, ${pendingOrders} pendientes`, pStartX + 5, py + 30);

      // Box 2: Avg Ticket
      docPdf.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
      docPdf.roundedRect(pStartX + pBoxWidth + pGap, py, pBoxWidth, pBoxHeight, 3, 3, 'F');
      docPdf.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      docPdf.setFontSize(12);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text('Ticket Promedio', pStartX + pBoxWidth + pGap + 5, py + 10);
      docPdf.setFontSize(20);
      docPdf.setTextColor(incomeColor[0], incomeColor[1], incomeColor[2]);
      docPdf.text(`$${avgTicket.toFixed(2)}`, pStartX + pBoxWidth + pGap + 5, py + 22);
      docPdf.setFontSize(9);
      docPdf.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
      docPdf.setFont('helvetica', 'normal');
      docPdf.text('Por pedido registrado', pStartX + pBoxWidth + pGap + 5, py + 30);

      py += pBoxHeight + pGap;

      // Box 3: Top Expense
      docPdf.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
      docPdf.roundedRect(pStartX, py, pBoxWidth, pBoxHeight, 3, 3, 'F');
      docPdf.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      docPdf.setFontSize(12);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text('Mayor Gasto', pStartX + 5, py + 10);
      docPdf.setFontSize(14);
      docPdf.setTextColor(expenseColor[0], expenseColor[1], expenseColor[2]);
      docPdf.text(topExpenseCategory ? topExpenseCategory[0] : 'N/A', pStartX + 5, py + 20);
      docPdf.setFontSize(12);
      docPdf.text(topExpenseCategory ? `$${topExpenseCategory[1].toFixed(2)}` : '$0.00', pStartX + 5, py + 28);

      // Box 4: Max's Tip
      docPdf.setFillColor(255, 241, 242); // rose-50
      docPdf.setDrawColor(225, 29, 72); // rose-600
      docPdf.roundedRect(pStartX + pBoxWidth + pGap, py, pBoxWidth, pBoxHeight, 3, 3, 'FD');
      docPdf.setTextColor(225, 29, 72);
      docPdf.setFontSize(12);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text('💡 Tip de Max', pStartX + pBoxWidth + pGap + 5, py + 10);
      docPdf.setTextColor(0, 0, 0);
      docPdf.setFontSize(9);
      docPdf.setFont('helvetica', 'normal');
      let tipText = '';
      if (netIncome > 0 && totalExpense > 0) {
        tipText = `Buen trabajo manteniendo rentabilidad. Tu mayor gasto fue ${topExpenseCategory ? topExpenseCategory[0] : ''}. Intenta optimizarlo el próximo mes.`;
      } else if (netIncome <= 0) {
        tipText = `Cuidado con los gastos. ${topExpenseCategory ? `Especialmente en ${topExpenseCategory[0]}` : ''}. Revisa si son necesarios o si puedes reducirlos.`;
      } else {
        tipText = `¡Mes perfecto! Sigue así, registrando todos tus movimientos para mantener el control.`;
      }
      docPdf.text(tipText, pStartX + pBoxWidth + pGap + 5, py + 18, { maxWidth: pBoxWidth - 10 });

      docPdf.save(`Reporte_Financiero_${monthName}_${year}.pdf`);

      // 3. Archive transactions in Firestore
      for (const tx of txsToArchive) {
        await updateDoc(doc(db, `users/${auth.currentUser.uid}/transactions`, tx.id), {
          archived: true
        });
      }

      setToast({ message: `Reportes de ${monthName} generados y archivados con éxito.`, type: 'success' });
      setTimeout(() => setToast(null), 3000);
      setMonthlyReportReady(null);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${auth.currentUser?.uid}/transactions`);
    }
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
    
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF" + headers.join(",") + "\n" + rows.map(e => e.map(v => `"${v}"`).join(",")).join("\n");
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

          <div className="space-y-4">
            {authMode === 'google' ? (
              <>
                <button onClick={handleLogin} disabled={isLoggingIn} className="btn-primary w-full py-4 text-lg flex items-center justify-center gap-2 disabled:opacity-50">
                  {isLoggingIn ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                      <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                        <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
                        <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
                        <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
                        <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
                      </g>
                    </svg>
                  )}
                  {isLoggingIn ? 'Iniciando sesión...' : 'Continuar con Google'}
                </button>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-800"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-[#111] text-gray-500">O</span>
                  </div>
                </div>
                <button 
                  onClick={() => setAuthMode('email_login')} 
                  className="w-full py-3 text-gray-400 hover:text-white border border-gray-800 rounded-xl transition-colors"
                >
                  Usar Correo y Contraseña
                </button>
              </>
            ) : (
              <form onSubmit={handleEmailAuth} className="space-y-4">
                <div className="space-y-3">
                  <input
                    type="email"
                    placeholder="Correo electrónico"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="input-field w-full bg-[#1A1A1A] border-gray-800"
                    required
                  />
                  <input
                    type="password"
                    placeholder="Contraseña"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="input-field w-full bg-[#1A1A1A] border-gray-800"
                    required
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={isLoggingIn} 
                  className="btn-primary w-full py-4 text-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isLoggingIn ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    authMode === 'email_login' ? 'Iniciar Sesión' : 'Crear Cuenta'
                  )}
                </button>
                
                <div className="flex flex-col items-center gap-2 pt-2">
                  <button 
                    type="button"
                    onClick={() => setAuthMode(authMode === 'email_login' ? 'email_register' : 'email_login')}
                    className="text-sm text-primary hover:underline"
                  >
                    {authMode === 'email_login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
                  </button>
                  <button 
                    type="button"
                    onClick={() => setAuthMode('google')}
                    className="text-sm text-gray-500 hover:text-white transition-colors mt-2"
                  >
                    Volver a Google
                  </button>
                </div>
              </form>
            )}
          </div>
          
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
              { id: 'calendar', icon: Calendar, label: 'Mi Calendario' },
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
                   activeTab === 'calendar' ? 'Mi Calendario' :
                   activeTab === 'finances' ? 'Control Financiero' :
                   'Configuración'}
                </h2>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                  {format(new Date(), "EEEE, d 'de' MMMM", { locale: es })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-4">
              {/* Buttons moved to FAB */}
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
                    orderFilter={orderFilter}
                    setOrderFilter={setOrderFilter}
                    filteredOrders={filteredOrders}
                    setIsOrderModalOpen={setIsOrderModalOpen}
                    setSelectedOrderDetails={setSelectedOrderDetails}
                  />
                )}
                {activeTab === 'finances' && (
                  <FinancesView 
                    getMonthlyData={getMonthlyData}
                    getWeeklyData={getWeeklyData}
                    currentWeekStats={currentWeekStats}
                    transactions={visibleTransactions}
                    formatCurrency={(v: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v)}
                    setTransactionToDelete={async (id: string) => {
                      showConfirmation({
                        title: 'Eliminar Transacción',
                        message: '¿Estás seguro de que deseas eliminar esta transacción?',
                        confirmText: 'Eliminar',
                        cancelText: 'Cancelar',
                        type: 'danger',
                        onConfirm: async () => {
                          if (!auth.currentUser) return;
                          try {
                            await deleteDoc(doc(db, `users/${auth.currentUser.uid}/transactions`, id));
                            setToast({ message: 'Transacción eliminada', type: 'success' });
                            setTimeout(() => setToast(null), 3000);
                          } catch (err: any) {
                            handleFirestoreError(err, OperationType.DELETE, `users/${auth.currentUser?.uid}/transactions/${id}`);
                          }
                        }
                      });
                    }}
                    getCategoryData={getCategoryData}
                    CHART_COLORS={['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']}
                  />
                )}
                {activeTab === 'calendar' && (
                  <CalendarView orders={orders} />
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
                    setPasswordPrompt={setPasswordPrompt}
                    limits={limits}
                    setLimits={setLimits}
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

      {/* Floating Action Button (FAB) */}
      <div className="fixed bottom-20 md:bottom-8 right-4 md:right-8 z-50 flex flex-col items-end gap-3">
        <AnimatePresence>
          {isFabOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.8 }}
              className="flex flex-col gap-3 items-end"
            >
              <button
                onClick={() => {
                  setIsFabOpen(false);
                  setOrderModalType('quote');
                  setIsOrderModalOpen(true);
                }}
                className="flex items-center gap-3 bg-[#1A1A1A] border border-white/10 hover:bg-white/10 text-white px-4 py-3 rounded-2xl shadow-xl transition-all"
              >
                <span className="font-bold text-sm">Nueva Cotización</span>
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                  <ClipboardList size={18} className="text-white" />
                </div>
              </button>

              <button
                onClick={() => {
                  setIsFabOpen(false);
                  setOrderModalType('order');
                  setIsOrderModalOpen(true);
                }}
                className="flex items-center gap-3 bg-[#1A1A1A] border border-white/10 hover:bg-white/10 text-white px-4 py-3 rounded-2xl shadow-xl transition-all"
              >
                <span className="font-bold text-sm">Nuevo Pedido</span>
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <Plus size={18} className="text-white" />
                </div>
              </button>
              
              <button
                onClick={() => {
                  setIsFabOpen(false);
                  setIsTransactionModalOpen(true);
                }}
                className="flex items-center gap-3 bg-[#1A1A1A] border border-white/10 hover:bg-white/10 text-white px-4 py-3 rounded-2xl shadow-xl transition-all"
              >
                <span className="font-bold text-sm">Nueva Transacción</span>
                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
                  <Wallet size={18} className="text-white" />
                </div>
              </button>

              <button
                onClick={() => {
                  setIsFabOpen(false);
                  handleLogout();
                }}
                className="md:hidden flex items-center gap-3 bg-[#1A1A1A] border border-white/10 hover:bg-white/10 text-white px-4 py-3 rounded-2xl shadow-xl transition-all"
              >
                <span className="font-bold text-sm">Cerrar Sesión</span>
                <div className="w-8 h-8 rounded-full bg-rose-500 flex items-center justify-center">
                  <LogOut size={18} className="text-white" />
                </div>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setIsFabOpen(!isFabOpen)}
          className={cn(
            "w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300",
            isFabOpen ? "bg-white/10 rotate-45" : "bg-primary hover:scale-105"
          )}
        >
          <Plus size={24} className="text-white" />
        </button>
      </div>

      {/* Chat Bubble Button */}
      {!isChatModalOpen && (
        <div className="fixed bottom-20 md:bottom-8 left-4 md:left-8 z-50">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-chat-modal'))}
            className="w-14 h-14 bg-primary hover:bg-primary/90 text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-105 relative"
          >
            <MessageSquare size={24} />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#0A0A0A]">
                {unreadChatCount > 9 ? '9+' : unreadChatCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Chat Modal (Floating Bubble) */}
      <AnimatePresence>
        {isChatModalOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-20 left-4 right-4 md:bottom-24 md:left-8 md:right-auto z-[100] bg-[#0A0A0A] flex flex-col md:w-[380px] h-[70vh] md:h-[600px] md:max-h-[80vh] rounded-2xl shadow-2xl border border-white/10 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#1A1A1A]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                  <MessageSquare size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight">Asesor Max</h3>
                  <p className="text-xs text-emerald-400 font-medium">En línea</p>
                </div>
              </div>
              <button 
                onClick={closeChatModal}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[#0A0A0A]">
              {chatMessages?.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-50">
                  <MessageSquare size={48} className="text-gray-500" />
                  <p className="text-sm text-gray-400 max-w-[250px]">
                    Hola, soy Max. ¿En qué te puedo ayudar con tus finanzas hoy?
                  </p>
                </div>
              ) : (
                chatMessages?.map((msg: any, idx: number) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3.5 rounded-2xl text-[15px] leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-primary text-white rounded-tr-sm' : 'bg-[#1A1A1A] text-gray-200 rounded-tl-sm border border-white/5'}`}>
                      <div className="markdown-body text-[15px]">
                        <Markdown>{msg.text}</Markdown>
                      </div>
                    </div>
                  </div>
                ))
              )}
              {isSendingMessage && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] p-4 rounded-2xl bg-[#1A1A1A] border border-white/5 rounded-tl-sm">
                    <div className="flex gap-1.5 items-center h-5">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-[#1A1A1A] border-t border-white/10 pb-safe">
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (chatInput.trim()) {
                    sendMessageToMax(chatInput);
                    setChatInput('');
                  }
                }}
                className="flex gap-2 items-end"
              >
                <div className="flex-1 bg-[#0A0A0A] border border-white/10 rounded-2xl overflow-hidden focus-within:border-primary/50 transition-colors">
                  <textarea 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (chatInput.trim()) {
                          sendMessageToMax(chatInput);
                          setChatInput('');
                        }
                      }
                    }}
                    placeholder="Escribe un mensaje..."
                    className="w-full bg-transparent px-4 py-3 text-[15px] focus:outline-none resize-none min-h-[50px] max-h-[120px]"
                    rows={1}
                    disabled={isSendingMessage}
                    style={{ height: 'auto' }}
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={isSendingMessage || !chatInput.trim()}
                  className="p-3.5 bg-primary hover:bg-primary/80 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 shadow-lg shadow-primary/20"
                >
                  <Send size={20} className="ml-0.5" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
                <h3 className="text-xl font-bold">{orderModalType === 'quote' ? 'Nueva Cotización' : 'Nuevo Pedido'}</h3>
                <button onClick={() => {
                  setIsOrderModalOpen(false);
                  setQuoteToConvert(null);
                }} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                  <X size={24} />
                </button>
              </div>
              <form 
                onSubmit={handleCreateOrder} 
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) {
                    const form = e.currentTarget;
                    const elements = Array.from(form.elements) as HTMLElement[];
                    const index = elements.indexOf(e.target as HTMLElement);
                    let focusedNext = false;
                    if (index > -1 && index < elements.length - 1) {
                      for (let i = index + 1; i < elements.length; i++) {
                        const nextEl = elements[i];
                        if (
                          (nextEl instanceof HTMLInputElement || nextEl instanceof HTMLSelectElement || nextEl instanceof HTMLTextAreaElement) &&
                          !nextEl.disabled &&
                          (nextEl as HTMLInputElement).type !== 'submit' &&
                          (nextEl as HTMLInputElement).type !== 'hidden'
                        ) {
                          e.preventDefault();
                          nextEl.focus();
                          focusedNext = true;
                          break;
                        }
                      }
                    }
                    // If we didn't focus a next element, let the default Enter behavior (submit) happen
                  }
                }}
                className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Cliente</label>
                    <input name="customer_name" required className="input-field w-full" placeholder="Nombre completo" defaultValue={quoteToConvert?.customer_name || ''} enterKeyHint="next" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Teléfono</label>
                    <input name="phone" type="tel" inputMode="numeric" pattern="[0-9]*" required className="input-field w-full" placeholder="10 dígitos" defaultValue={quoteToConvert?.phone || ''} enterKeyHint="next" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">Dirección</label>
                  <input name="address" className="input-field w-full" placeholder="Calle, número, colonia" defaultValue={quoteToConvert?.address || ''} enterKeyHint="next" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Fecha de Entrega</label>
                    <input name="delivery_date" type="date" required className="input-field w-full" defaultValue={quoteToConvert?.delivery_date || ''} enterKeyHint="next" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Tipo de Trabajo</label>
                    <select name="work_type" required className="input-field w-full" defaultValue={quoteToConvert?.work_type || 'Sala'} enterKeyHint="next">
                      <option value="Sala">Sala</option>
                      <option value="Silla">Silla</option>
                      <option value="Asiento Carro">Asiento Carro</option>
                      <option value="Camion">Camión</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">Material</label>
                  <input name="material" className="input-field w-full" placeholder="Tipo de tela, color, etc." defaultValue={quoteToConvert?.material || ''} enterKeyHint="next" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">Descripción del trabajo</label>
                  <textarea name="description" className="input-field w-full min-h-[80px] resize-y" placeholder="Detalles específicos del trabajo a realizar..." defaultValue={quoteToConvert?.description || ''} enterKeyHint="next"></textarea>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Total</label>
                    <input name="total" type="number" inputMode="decimal" required className="input-field w-full" placeholder="0.00" defaultValue={quoteToConvert?.total || ''} enterKeyHint="next" />
                  </div>
                  {!orderModalType || orderModalType === 'order' ? (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase">Anticipo</label>
                      <input name="advance" type="number" inputMode="decimal" required className="input-field w-full" placeholder="0.00" enterKeyHint="done" />
                    </div>
                  ) : (
                    <input name="advance" type="hidden" value="0" />
                  )}
                </div>
                <button type="submit" className="btn-primary w-full py-4 text-lg">{orderModalType === 'quote' ? 'Crear Cotización' : 'Crear Pedido'}</button>
              </form>
            </motion.div>
          </motion.div>
        )}



        {/* Monthly Report Ready Modal */}
        {monthlyReportReady && (
          <motion.div 
            key="monthly-report-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-[#1A1A1A] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-white/10"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-primary/20 to-transparent">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg bg-primary/20 text-primary">
                    <Calendar size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Informe Mensual Listo</h3>
                  </div>
                </div>
                <button onClick={() => {
                  setSnoozedMonthlyReportKey(`monthly-${monthlyReportReady.year}-${monthlyReportReady.month}`);
                  setMonthlyReportReady(null);
                }} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                  <X size={24} />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <p className="text-gray-300">
                  El historial de transacciones de <span className="font-bold text-white">{format(new Date(monthlyReportReady.year, monthlyReportReady.month), 'MMMM yyyy', { locale: es })}</span> está listo para ser archivado.
                </p>
                <p className="text-sm text-gray-400">
                  Al archivar, se descargará un archivo Excel con todas las transacciones del mes y se limpiará el historial de la aplicación para dar paso al nuevo mes.
                </p>
                <div className="flex flex-col gap-3">
                  <button onClick={handleArchiveMonth} className="btn-primary w-full py-3">
                    Descargar y Archivar
                  </button>
                  <button onClick={() => {
                    setSnoozedMonthlyReportKey(`monthly-${monthlyReportReady.year}-${monthlyReportReady.month}`);
                    setMonthlyReportReady(null);
                  }} className="w-full py-3 rounded-xl font-bold bg-white/5 hover:bg-white/10 transition-colors">
                    Recordarme más tarde
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Weekly Report Ready Modal */}
        {weeklyReportReady && (
          <motion.div 
            key="weekly-report-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-[#141414] border border-white/10 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative"
            >
              <div className="p-8 text-center">
                <div className="w-20 h-20 bg-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <FileText className="text-rose-500" size={40} />
                </div>
                <h2 className="text-2xl font-black text-white mb-2">¡Corte Semanal Listo!</h2>
                <p className="text-gray-400 mb-6">
                  Tu reporte financiero y de pedidos de la semana (hasta el sábado a las 3:00 PM) está listo para descargar en PDF.
                </p>
                <div className="flex flex-col gap-3">
                  <button onClick={handleDownloadWeeklyReport} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                    <Download size={20} />
                    Descargar Reporte (PDF)
                  </button>
                  <button onClick={() => {
                    setSnoozedWeeklyReportKey(weeklyReportReady.cutoffKey);
                    setWeeklyReportReady(null);
                  }} className="w-full py-3 rounded-xl font-bold bg-white/5 hover:bg-white/10 transition-colors">
                    Recordarme más tarde
                  </button>
                </div>
              </div>
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
              <form 
                onSubmit={handleCreateTransaction} 
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) {
                    const form = e.currentTarget;
                    const elements = Array.from(form.elements) as HTMLElement[];
                    const index = elements.indexOf(e.target as HTMLElement);
                    let focusedNext = false;
                    if (index > -1 && index < elements.length - 1) {
                      for (let i = index + 1; i < elements.length; i++) {
                        const nextEl = elements[i];
                        if (
                          (nextEl instanceof HTMLInputElement || nextEl instanceof HTMLSelectElement || nextEl instanceof HTMLTextAreaElement) &&
                          !nextEl.disabled &&
                          (nextEl as HTMLInputElement).type !== 'submit' &&
                          (nextEl as HTMLInputElement).type !== 'hidden'
                        ) {
                          e.preventDefault();
                          nextEl.focus();
                          focusedNext = true;
                          break;
                        }
                      }
                    }
                    // If we didn't focus a next element, let the default Enter behavior (submit) happen
                  }
                }}
                className="p-6 space-y-6"
              >
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
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg bg-primary/20 text-primary">
                    <ClipboardList size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{selectedOrderDetails.is_quote ? 'Resumen de Cotización' : 'Resumen del Pedido'}</h3>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => {
                    setEditingOrder(selectedOrderDetails);
                    setIsEditModalOpen(true);
                  }} className="p-2 rounded-full hover:bg-white/10 transition-colors" title="Editar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </button>
                  <button onClick={() => setSelectedOrderDetails(null)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                    <X size={24} />
                  </button>
                </div>
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
                    <p className="font-bold">{safeFormatDate(selectedOrderDetails.delivery_date, 'dd/MM/yyyy')}</p>
                  </div>
                </div>

                {selectedOrderDetails.description && (
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                    <p className="text-[10px] text-gray-500 uppercase font-black mb-2">Descripción del trabajo</p>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">{selectedOrderDetails.description}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">Contacto y Ubicación</h4>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
                        <ClipboardList size={18} className="text-gray-500" />
                        <span className="font-bold">{selectedOrderDetails.customer_name}</span>
                      </div>
                      <a href={`tel:${selectedOrderDetails.phone}`} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-primary/10 hover:text-primary transition-all group">
                        <Smartphone size={18} className="text-gray-500 group-hover:text-primary" />
                        <span className="font-bold">{selectedOrderDetails.phone}</span>
                      </a>
                      <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5">
                        <LayoutDashboard size={18} className="text-gray-500 mt-0.5" />
                        <span className="text-sm text-gray-300">{selectedOrderDetails.address || 'Sin dirección registrada'}</span>
                      </div>
                    </div>
                  </div>

                </div>
                <div className="space-y-4 pt-4 border-t border-white/5">
                  {!selectedOrderDetails.is_quote && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Anticipo pagado</span>
                      <span className="font-mono font-bold text-emerald-500">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(selectedOrderDetails.advance)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pb-4 border-b border-white/5">
                    <span className="text-white font-bold text-lg">{selectedOrderDetails.is_quote ? 'Total Cotizado' : 'Saldo Restante'}</span>
                    <span className="font-mono font-black text-2xl text-primary">
                      {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(selectedOrderDetails.is_quote ? selectedOrderDetails.total : selectedOrderDetails.total - selectedOrderDetails.advance)}
                    </span>
                  </div>

                  <div className="flex flex-col gap-3 pt-2">
                    <button 
                      onClick={() => handleDownloadAndSharePDF(selectedOrderDetails)}
                      className="py-4 flex items-center justify-center gap-3 text-white font-bold hover:bg-white/5 rounded-2xl transition-colors"
                    >
                      <Download size={20} />
                      {selectedOrderDetails.is_quote ? 'Descargar Cotización (PDF)' : 'Descargar Nota de Remisión (PDF)'}
                    </button>

                    <button 
                      onClick={() => window.open(`tel:${selectedOrderDetails.phone}`)}
                      className="py-4 bg-[#1A1A1A] text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-[#252525] transition-colors"
                    >
                      <Smartphone size={20} className="text-primary" />
                      Llamar Cliente
                    </button>

                    <button 
                      onClick={() => {
                        let text = '';
                        if (selectedOrderDetails.is_quote) {
                          text = `Estimado/a ${selectedOrderDetails.customer_name}, le compartimos la cotización solicitada por el trabajo de ${selectedOrderDetails.work_type}. Enseguida le enviaremos el documento PDF.`;
                        } else {
                          text = profile.whatsapp_template
                            .replace('{empresa}', profile.business_name)
                            .replace('{cliente}', selectedOrderDetails.customer_name)
                            .replace('{trabajo}', selectedOrderDetails.work_type)
                            .replace('{material}', selectedOrderDetails.material)
                            .replace('{entrega}', safeFormatDate(selectedOrderDetails.delivery_date, 'dd/MM/yyyy'))
                            .replace('{total}', selectedOrderDetails.total.toString())
                            .replace('{anticipo}', selectedOrderDetails.advance.toString())
                            .replace('{restante}', (selectedOrderDetails.total - selectedOrderDetails.advance).toString());
                        }
                        
                        const url = profile.use_whatsapp_business 
                          ? `https://wa.me/52${selectedOrderDetails.phone}?text=${encodeURIComponent(text)}`
                          : `https://api.whatsapp.com/send?phone=52${selectedOrderDetails.phone}&text=${encodeURIComponent(text)}`;
                        window.open(url, '_blank');
                      }}
                      className="py-4 bg-[#00D084] text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-[#00B874] transition-colors"
                    >
                      <MessageCircle size={20} />
                      {selectedOrderDetails.is_quote ? 'Enviar al cliente' : 'Mandar mensaje al cliente'}
                    </button>

                    {selectedOrderDetails.status === 'pending' && !selectedOrderDetails.is_quote && (
                      <>
                        <button 
                          onClick={() => setPaymentModal({ isOpen: true, orderId: selectedOrderDetails.id, amount: '' })}
                          className="py-4 bg-[#6366F1] text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-[#5254D8] transition-colors"
                        >
                          <Wallet size={20} />
                          Dar Abono
                        </button>

                        <button 
                          onClick={() => handleCompleteOrder(selectedOrderDetails.id)}
                          className="py-4 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                        >
                          <CheckCircle2 size={20} />
                          Finalizar Pedido
                        </button>
                      </>
                    )}

                    {selectedOrderDetails.is_quote && (
                      <button 
                        onClick={() => {
                          setQuoteToConvert(selectedOrderDetails);
                          setOrderModalType('order');
                          setSelectedOrderDetails(null);
                          setIsOrderModalOpen(true);
                        }}
                        className="py-4 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                      >
                        <Plus size={20} />
                        Convertir a Pedido
                      </button>
                    )}

                    <button 
                      onClick={() => {
                        setOrderToDelete(selectedOrderDetails.id);
                        setPasswordPrompt({ isOpen: true, action: 'delete_order', passwordInput: '', newPasswordInput: '' });
                      }}
                      className="py-4 bg-[#2A1115] text-primary rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-[#3A181D] transition-colors"
                    >
                      <Trash2 size={20} />
                      {selectedOrderDetails.is_quote ? 'Eliminar Cotización' : 'Cancelar Pedido'}
                    </button>
                  </div>
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
              <form 
                onSubmit={handleRegisterPayment} 
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) {
                    const form = e.currentTarget;
                    const elements = Array.from(form.elements) as HTMLElement[];
                    const index = elements.indexOf(e.target as HTMLElement);
                    let focusedNext = false;
                    if (index > -1 && index < elements.length - 1) {
                      for (let i = index + 1; i < elements.length; i++) {
                        const nextEl = elements[i];
                        if (
                          (nextEl instanceof HTMLInputElement || nextEl instanceof HTMLSelectElement || nextEl instanceof HTMLTextAreaElement) &&
                          !nextEl.disabled &&
                          (nextEl as HTMLInputElement).type !== 'submit' &&
                          (nextEl as HTMLInputElement).type !== 'hidden'
                        ) {
                          e.preventDefault();
                          nextEl.focus();
                          focusedNext = true;
                          break;
                        }
                      }
                    }
                    // If we didn't focus a next element, let the default Enter behavior (submit) happen
                  }
                }}
                className="p-6 space-y-6"
              >
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

        {/* Edit Order Modal */}
        {isEditModalOpen && editingOrder && (
          <motion.div 
            key="edit-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-[#1A1A1A] rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-white/10"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center">
                <h3 className="text-xl font-bold">Editar {editingOrder.is_quote ? 'Cotización' : 'Pedido'}</h3>
                <button onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingOrder(null);
                }} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                  <X size={24} />
                </button>
              </div>
              <form 
                onSubmit={handleEditOrder} 
                className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Cliente</label>
                    <input name="customer_name" required className="input-field w-full" defaultValue={editingOrder.customer_name} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Teléfono</label>
                    <input name="phone" type="tel" inputMode="numeric" pattern="[0-9]*" required className="input-field w-full" defaultValue={editingOrder.phone} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">Dirección</label>
                  <input name="address" className="input-field w-full" defaultValue={editingOrder.address} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Fecha de Entrega</label>
                    <input name="delivery_date" type="date" required className="input-field w-full" defaultValue={editingOrder.delivery_date} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Material</label>
                    <input name="material" required className="input-field w-full" defaultValue={editingOrder.material} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Tipo de Trabajo</label>
                    <select name="work_type" required className="input-field w-full" defaultValue={editingOrder.work_type}>
                      <option value="Muebles">Muebles</option>
                      <option value="Automotriz">Automotriz</option>
                      <option value="Cortinas">Cortinas</option>
                      <option value="Reparación">Reparación</option>
                      <option value="Otro">Otro</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">Descripción</label>
                  <textarea name="description" className="input-field w-full min-h-[100px]" defaultValue={editingOrder.description} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Total</label>
                    <input name="total" type="number" inputMode="decimal" required className="input-field w-full" defaultValue={editingOrder.total} />
                  </div>
                  {!editingOrder.is_quote ? (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase">Anticipo</label>
                      <input name="advance" type="number" inputMode="decimal" required className="input-field w-full" defaultValue={editingOrder.advance} />
                    </div>
                  ) : (
                    <input name="advance" type="hidden" value="0" />
                  )}
                </div>
                <button type="submit" className="btn-primary w-full py-4 text-lg">Guardar Cambios</button>
              </form>
            </motion.div>
          </motion.div>
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
              toast.type === 'success' ? "bg-emerald-500 border-emerald-400 text-white" : 
              toast.type === 'warning' ? "bg-amber-500 border-amber-400 text-white" : 
              "bg-rose-500 border-rose-400 text-white"
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
