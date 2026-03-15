"use client";

import { useState, useEffect } from "react";
import { DownloadCloud, X } from "lucide-react";
import { useAppStore } from "@/store/appStore";

export default function InstallPrompt() {
    const [isInstallable, setIsInstallable] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showPrompt, setShowPrompt] = useState(false);
    
    // Using a hydration check to prevent SSR mismatch
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        
        // Has the user dismissed it before?
        if (localStorage.getItem("app_install_dismissed") === "true") {
            return;
        }

        const handleBeforeInstallPrompt = (e: Event) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Stash the event so it can be triggered later.
            setDeferredPrompt(e);
            // Update UI notify the user they can install the PWA
            setIsInstallable(true);
            
            // Show prompt after a slight delay to not interrupt immediate loading
            setTimeout(() => {
                setShowPrompt(true);
            }, 3000);
        };

        window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

        // Check if app is already installed
        window.addEventListener("appinstalled", () => {
            setIsInstallable(false);
            setShowPrompt(false);
            setDeferredPrompt(null);
            console.log("PWA was installed");
        });

        return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        
        // Show the install prompt
        deferredPrompt.prompt();
        
        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        
        // We've used the prompt, and can't use it again, throw it away
        setDeferredPrompt(null);
        setIsInstallable(false);
        setShowPrompt(false);
    };

    const handleDismiss = () => {
        setShowPrompt(false);
        localStorage.setItem("app_install_dismissed", "true");
    };

    if (!mounted || !isInstallable || !showPrompt) return null;

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-sm z-50 animate-fade-in-up">
            <div className="bg-white rounded-2xl p-5 shadow-2xl border border-slate-200/60 overflow-hidden relative">
                {/* Decorative background glow */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                
                <button 
                    onClick={handleDismiss}
                    className="absolute top-3 right-3 p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors"
                    aria-label="Dismiss installation prompt"
                >
                    <X size={16} />
                </button>
                
                <div className="flex gap-4 items-start relative z-10">
                    <div className="w-14 h-14 shrink-0 bg-blue-600 rounded-2xl flex items-center justify-center shadow-inner shadow-white/20">
                        {/* We use an img tag pointing to our manifest icon here */}
                        <img src="/icon-192x192.png" alt="App Icon" className="w-full h-full object-cover rounded-2xl" />
                    </div>
                    
                    <div className="flex-1 pt-1">
                        <h3 className="font-black text-slate-800 tracking-tight leading-tight">Install Fuel Station</h3>
                        <p className="text-xs text-slate-500 mt-1 leading-snug">
                            Add to your home screen for quick offline access and a faster experience.
                        </p>
                    </div>
                </div>
                
                <button
                    onClick={handleInstallClick}
                    className="w-full mt-5 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl shadow-md shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                    <DownloadCloud size={18} />
                    Install App
                </button>
            </div>
        </div>
    );
}
