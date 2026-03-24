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
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { GoogleGenAI } from '@google/genai';
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from './lib/utils';
import { jsPDF } from 'jspdf';
import { db, auth } from './firebase';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, addDoc } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
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
}

interface Transaction {
  id: string;
  date: string;
  concept: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  order_id?: string;
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
    const date = new Date(dateString);
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
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [selectedTheme, setSelectedTheme] = useState('default');
  const [confirmationModal, setConfirmationModal] = useState<any>({ isOpen: false, title: '', message: '', onConfirm: () => {}, confirmText: '', cancelText: '', type: 'primary' });
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [passwordPrompt, setPasswordPrompt] = useState<any>({ isOpen: false, action: '', passwordInput: '', newPasswordInput: '' });
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);
  const [paymentModal, setPaymentModal] = useState<{ isOpen: boolean, orderId: string | null, amount: string }>({ isOpen: false, orderId: null, amount: '' });

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const provider = new GoogleAuthProvider();
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
    } catch (err: any) {
      setToast({ message: err.message || 'Error al iniciar sesión', type: 'error' });
      setTimeout(() => setToast(null), 3000);
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
    if (transactions.length === 0) return;
    setIsGeneratingInsights(true);
    try {
      const apiKey = process.env.GEMINI_API_KEY;

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

  const sendMessageToMax = async (message: string) => {
    if (!auth.currentUser || !message.trim()) return;
    setIsSendingMessage(true);
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "undefined" || apiKey === "null" || apiKey.trim() === "") {
        setToast({ message: "La IA no está configurada.", type: 'error' });
        return;
      }

      const userId = auth.currentUser.uid;
      const userMsg = { role: 'user', text: message, timestamp: new Date().toISOString() };
      await addDoc(collection(db, `users/${userId}/financial_chat`), userMsg);

      const ai = new GoogleGenAI({ apiKey });
      
      // Build context
      const recentTrans = transactions.slice(0, 20).map(t => `${t.date}: ${t.concept} (${t.type === 'income' ? '+' : '-'}${t.amount})`).join('\n');
      const recentOrders = orders.slice(0, 10).map(o => `${o.work_type} - ${o.status} - Total: ${o.total}`).join('\n');
      
      const systemInstruction = `Eres Max, un asesor financiero experto y amigable para un negocio de tapicería.
      Tu objetivo es dar consejos financieros, analizar gastos y ayudar a mejorar la rentabilidad basándote en los datos del negocio.
      
      Datos recientes del negocio:
      Transacciones:
      ${recentTrans}
      
      Últimos pedidos:
      ${recentOrders}
      
      Responde de manera concisa, útil y motivadora.`;

      const recentMessages = chatMessages.slice(-10);
      const conversationHistory = recentMessages.map(msg => `${msg.role === 'model' ? 'Max' : 'Usuario'}: ${msg.text}`).join('\n\n');
      
      const prompt = `Historial de conversación:
${conversationHistory}

Usuario: ${message}`;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { systemInstruction }
      });

      const aiMsg = { role: 'model', text: result.text || "No pude procesar tu solicitud.", timestamp: new Date().toISOString() };
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
    } finally {
      setIsSendingMessage(false);
    }
  };

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
  }, [orders, searchTerm, orderFilter]);

  const capacityWarnings = useMemo(() => {
    const pendingByWork = orders.filter(o => o.status === 'pending' && !o.is_quote).reduce((acc: any, o) => {
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

  const getWeeklyData = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday
    const end = endOfWeek(new Date(), { weekStartsOn: 1 }); // Sunday
    
    const days = eachDayOfInterval({ start, end }).map(date => ({
      date,
      name: format(date, 'EEEE', { locale: es }).substring(0, 3).toUpperCase(),
      income: 0,
      expense: 0
    }));

    transactions.forEach(t => {
      const tDate = new Date(t.date);
      const dayData = days.find(d => isSameDay(d.date, tDate));
      if (dayData) {
        if (t.type === 'income') dayData.income += Number(t.amount);
        else dayData.expense += Number(t.amount);
      }
    });

    return days;
  }, [transactions]);

  const currentWeekStats = useMemo(() => {
    return getWeeklyData.reduce((acc, day) => {
      acc.income += day.income;
      acc.expense += day.expense;
      return acc;
    }, { income: 0, expense: 0 });
  }, [getWeeklyData]);

  const getCategoryData = useMemo(() => {
    const cats: any = {};
    transactions.filter(t => t.type === 'expense').forEach(t => {
      cats[t.category] = (cats[t.category] || 0) + Number(t.amount);
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value: Number(value) }));
  }, [transactions]);

  // --- Handlers ---
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

      // Save the PDF
      const fileName = `${isQuote ? 'Cotizacion' : 'Nota_Remision'}_${order.customer_name.replace(/\s+/g, '_')}.pdf`;
      doc.save(fileName);

      // Share via Web Share API if available
      try {
        const pdfBlob = doc.output('blob');
        const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: isQuote ? 'Cotización' : 'Nota de Remisión',
            text: isQuote ? `Estimado/a ${order.customer_name}, le compartimos la cotización solicitada.` : `Estimado/a ${order.customer_name}, le compartimos su nota de remisión.`,
          });
        } else {
          // Fallback: open WhatsApp with text
          const text = isQuote 
            ? `Estimado/a ${order.customer_name}, le compartimos la cotización solicitada por el trabajo de ${order.work_type}. Enseguida le enviaremos el documento PDF.`
            : `Estimado/a ${order.customer_name}, es un placer saludarle. Le informamos que su nota de remisión por el trabajo de ${order.work_type} ha sido generada. Enseguida le enviaremos el documento PDF. Agradecemos su preferencia.`;
          const url = profile.use_whatsapp_business 
            ? `https://wa.me/52${order.phone}?text=${encodeURIComponent(text)}`
            : `https://api.whatsapp.com/send?phone=52${order.phone}&text=${encodeURIComponent(text)}`;
          window.open(url, '_blank');
        }
      } catch (shareError: any) {
        if (shareError.name === 'AbortError' || (shareError.message && shareError.message.includes('canceled'))) {
          // User canceled the share, do nothing
          return;
        }
        console.error("Error sharing:", shareError);
        // Fallback to just opening WhatsApp if sharing fails
        const text = isQuote 
          ? `Estimado/a ${order.customer_name}, le compartimos la cotización solicitada por el trabajo de ${order.work_type}. Enseguida le enviaremos el documento PDF.`
          : `Estimado/a ${order.customer_name}, es un placer saludarle. Le informamos que su nota de remisión por el trabajo de ${order.work_type} ha sido generada. Enseguida le enviaremos el documento PDF. Agradecemos su preferencia.`;
        const url = profile.use_whatsapp_business 
          ? `https://wa.me/52${order.phone}?text=${encodeURIComponent(text)}`
          : `https://api.whatsapp.com/send?phone=52${order.phone}&text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
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
    
    const executeOrderCreation = async () => {
      try {
        const orderData = {
          ...data,
          uid: auth.currentUser!.uid,
          total: Number(data.total),
          advance: advanceAmount,
          status: 'pending',
          registration_date: new Date().toISOString(),
          is_quote: isQuote
        };
        
        await addDoc(collection(db, `users/${auth.currentUser!.uid}/orders`), orderData);
        
        if (!isQuote && advanceAmount > 0) {
          const txData = {
            type: 'income',
            amount: advanceAmount,
            concept: `Anticipo de pedido: ${data.customer_name}`,
            date: new Date().toISOString(),
            uid: auth.currentUser!.uid,
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
        setToast({ message: orderModalType === 'quote' ? 'Cotización creada con éxito' : 'Pedido creado con éxito', type: 'success' });
        setTimeout(() => setToast(null), 3000);
      } catch (err: any) {
        handleFirestoreError(err, OperationType.CREATE, `users/${auth.currentUser?.uid}/orders`);
      }
    };

    const limitObj = limits.find(l => l.work_type === workType);
    if (limitObj && !isQuote) {
      const currentPending = orders.filter(o => o.status === 'pending' && !o.is_quote && o.work_type === workType).length;
      if (currentPending >= limitObj.limit_val) {
        showConfirmation({
          title: 'Límite de Capacidad Alcanzado',
          message: `Has alcanzado el límite de capacidad para trabajos de tipo "${workType}" (${limitObj.limit_val} pendientes). ¿Deseas registrar este pedido de todos modos?`,
          confirmText: 'Sí, registrar',
          cancelText: 'Cancelar',
          type: 'warning',
          onConfirm: executeOrderCreation
        });
        return;
      }
    }

    executeOrderCreation();
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
        date: new Date().toISOString(),
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
          date: new Date().toISOString(),
          uid: auth.currentUser.uid,
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
    // Password check is skipped in Firebase version for simplicity, or could be implemented with reauthenticateWithCredential
    try {
      await deleteDoc(doc(db, `users/${auth.currentUser.uid}/orders`, orderToDelete));
      setOrderToDelete(null);
      setPasswordPrompt({ isOpen: false, action: '', passwordInput: '', newPasswordInput: '' });
      setSelectedOrderDetails(null);
      setToast({ message: 'Pedido eliminado', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `users/${auth.currentUser?.uid}/orders/${orderToDelete}`);
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
          date: new Date().toISOString(),
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
            <button onClick={handleLogin} className="btn-primary w-full py-4 text-lg flex items-center justify-center gap-2">
              <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                  <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
                  <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
                  <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
                  <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
                </g>
              </svg>
              Continuar con Google
            </button>
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
                    transactions={transactions}
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

                    {!selectedOrderDetails.is_quote && (
                      <button className="py-4 bg-[#2A1115] text-primary rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-[#3A181D] transition-colors">
                        <Calendar size={20} />
                        Sincronizar con Calendario
                      </button>
                    )}

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
