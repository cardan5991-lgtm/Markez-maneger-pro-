import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, X } from 'lucide-react';

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check if prompt is already saved
    if (window.deferredPrompt) {
      setDeferredPrompt(window.deferredPrompt);
      setShowBanner(true);
    }

    // Listen for the custom event
    const handleInstallReady = () => {
      if (window.deferredPrompt) {
        setDeferredPrompt(window.deferredPrompt);
        setShowBanner(true);
      }
    };

    window.addEventListener('pwa-install-ready', handleInstallReady);

    // Also listen to beforeinstallprompt just in case
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      window.deferredPrompt = e;
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Clean up
    return () => {
      window.removeEventListener('pwa-install-ready', handleInstallReady);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Show the prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond
    const { outcome } = await deferredPrompt.userChoice;
    
    // Optionally, send analytics event with outcome of user choice
    console.log(`User response to the install prompt: ${outcome}`);
    
    // We've used the prompt, and can't use it again, throw it away
    window.deferredPrompt = null;
    setDeferredPrompt(null);
    setShowBanner(false);
  };

  const handleDismiss = () => {
    setShowBanner(false);
  };

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ type: 'spring', damping: 20, stiffness: 100 }}
          className="fixed bottom-[85px] left-4 right-4 z-40 bg-[#2a2a2a] border border-[#ff4b4b]/30 rounded-2xl shadow-2xl p-4 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3 flex-1">
            <div className="bg-[#ff4b4b]/20 p-2 rounded-xl text-[#ff4b4b]">
              <Download size={24} />
            </div>
            <div>
              <h4 className="text-white font-bold text-sm">Instalar Markez Pro</h4>
              <p className="text-gray-400 text-xs mt-0.5">Accede más rápido y recibe notificaciones.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleInstallClick}
              className="bg-[#ff4b4b] hover:bg-[#e63e3e] text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors whitespace-nowrap shadow-lg shadow-[#ff4b4b]/20"
            >
              Instalar
            </button>
            <button
              onClick={handleDismiss}
              className="p-2 text-gray-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
              aria-label="Dismiss"
            >
              <X size={18} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
