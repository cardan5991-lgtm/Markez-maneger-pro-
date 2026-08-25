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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-[#1A1A1A] w-full max-w-sm border border-[#ff4b4b]/30 rounded-3xl shadow-2xl p-6 flex flex-col items-center text-center relative"
          >
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>

            <div className="bg-[#ff4b4b]/20 p-4 rounded-2xl text-[#ff4b4b] mb-4 mt-2">
              <Download size={36} />
            </div>
            
            <h4 className="text-white font-bold text-2xl mb-2">Instalar App</h4>
            <p className="text-gray-400 text-sm mb-8 leading-relaxed">
              Instala Markez Manager Pro en tu dispositivo para tener acceso directo, usarla en pantalla completa y trabajar sin distracciones.
            </p>
            
            <div className="flex flex-col w-full gap-3">
              <button
                onClick={handleInstallClick}
                className="w-full bg-[#ff4b4b] hover:bg-[#e63e3e] text-white font-bold text-lg py-4 px-4 rounded-xl transition-all shadow-lg shadow-[#ff4b4b]/20"
              >
                Instalar Ahora
              </button>
              <button
                onClick={handleDismiss}
                className="w-full py-3 px-4 text-gray-400 hover:text-white font-bold rounded-xl hover:bg-white/5 transition-all"
              >
                Quizás más tarde
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
