import React, { useState, useRef } from 'react';
import { X, Upload, Copy, Check, Sparkles, Loader2, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from '@google/genai';

interface PostCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessName?: string;
}

export const PostCreatorModal: React.FC<PostCreatorModalProps> = ({ isOpen, onClose, businessName = "Markez Tapicería" }) => {
  const [image, setImage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [generatedPost, setGeneratedPost] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setGeneratedPost(null);
        setError(null);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const generatePost = async () => {
    if (!image || !file) return;

    setIsGenerating(true);
    setError(null);
    setGeneratedPost(null);

    try {
      // Fetch API key from backend
      const configRes = await fetch("/api/config/gemini");
      const configData = await configRes.json();
      const apiKey = configData.apiKey;

      if (!apiKey || apiKey === "undefined" || apiKey === "null" || apiKey.trim() === "") {
        throw new Error("La Inteligencia Artificial no está disponible en este momento (Falta configuración).");
      }

      const ai = new GoogleGenAI({ apiKey });

      // Convert image to base64 format required by Gemini
      const base64Data = image.split(',')[1];
      
      const prompt = `Actúa como un experto en marketing digital para una tapicería llamada "${businessName}".
      He subido una foto de un trabajo de tapicería que acabamos de terminar.
      Escribe una publicación atractiva y vendedora para Facebook, Instagram y WhatsApp.
      La publicación debe:
      1. Resaltar la calidad del trabajo y el cambio (si es evidente).
      2. Incluir un llamado a la acción (Call to Action) invitando a cotizar sin compromiso.
      3. Usar emojis relevantes.
      4. Incluir hashtags populares para tapicería y restauración de muebles.
      Mantén un tono profesional pero cercano y amigable.`;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: file.type,
                data: base64Data
              }
            },
            { text: prompt }
          ]
        }
      });

      // Find the text part in the response
      let textResponse = "";
      if (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts) {
        for (const part of result.candidates[0].content.parts) {
          if (part.text) {
            textResponse += part.text;
          }
        }
      } else if (result.text) {
        textResponse = result.text;
      }

      if (textResponse) {
        setGeneratedPost(textResponse);
      } else {
        throw new Error("No se pudo generar el texto. Intenta con otra imagen.");
      }
    } catch (err: any) {
      console.error("[AI] Error generating post:", err);
      const errorMessage = err.message || "";
      if (errorMessage.includes("429") || errorMessage.includes("quota") || errorMessage.includes("exceeded")) {
        setError("Has alcanzado el límite de uso gratuito de la Inteligencia Artificial por este minuto. Por favor, espera unos 30 segundos y vuelve a intentarlo.");
      } else {
        setError("Ocurrió un error al generar la publicación. Por favor, intenta de nuevo.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    if (generatedPost) {
      navigator.clipboard.writeText(generatedPost);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            key="post-creator-modal"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-[#1A1A1A] rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-white/10 flex flex-col max-h-[90vh]"
          >
          {/* Header */}
          <div className="flex justify-between items-center p-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                <Sparkles className="text-white" size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Creador de Posts IA</h2>
                <p className="text-sm text-gray-400">Genera publicaciones para tus redes sociales</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
            >
              <X size={24} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Image Upload */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">1. Sube tu foto</h3>
                
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  ref={fileInputRef}
                  className="hidden"
                />
                
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full aspect-square rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden relative ${image ? 'border-primary/50 bg-black/20' : 'border-white/20 hover:border-primary/50 hover:bg-white/5'}`}
                >
                  {image ? (
                    <>
                      <img src={image} alt="Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                        <p className="text-white font-medium flex items-center gap-2">
                          <Upload size={18} /> Cambiar foto
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center text-gray-400 p-6 text-center">
                      <ImageIcon size={48} className="mb-4 text-gray-500" />
                      <p className="font-medium text-white mb-1">Toca para subir una foto</p>
                      <p className="text-xs">Sube una foto del mueble terminado (JPG, PNG)</p>
                    </div>
                  )}
                </div>

                <button
                  onClick={generatePost}
                  disabled={!image || isGenerating}
                  className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Generando magia...
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      Generar Publicación
                    </>
                  )}
                </button>
              </div>

              {/* Right Column: Result */}
              <div className="space-y-4 flex flex-col">
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">2. Tu Publicación</h3>
                
                <div className="flex-1 bg-black/30 rounded-2xl border border-white/10 p-4 relative min-h-[300px] flex flex-col">
                  {error ? (
                    <div className="text-rose-400 text-sm p-4 bg-rose-500/10 rounded-xl border border-rose-500/20">
                      {error}
                    </div>
                  ) : generatedPost ? (
                    <>
                      <div className="text-sm text-gray-200 whitespace-pre-wrap flex-1 overflow-y-auto custom-scrollbar pb-12">
                        {generatedPost}
                      </div>
                      <div className="absolute bottom-4 right-4">
                        <button
                          onClick={copyToClipboard}
                          className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg font-bold hover:bg-gray-200 transition-colors shadow-lg"
                        >
                          {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                          {copied ? '¡Copiado!' : 'Copiar Texto'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-center p-6">
                      <Sparkles size={32} className="mb-3 opacity-50" />
                      <p className="text-sm">Sube una foto y presiona "Generar Publicación" para que la IA escriba un texto vendedor para tus redes sociales.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
};
