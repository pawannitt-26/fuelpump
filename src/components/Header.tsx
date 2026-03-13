"use client";

import { useAppStore } from '@/store/appStore';
import { Menu, Globe, UserCircle } from 'lucide-react';

export default function Header() {
    const { language, setLanguage, setSidebarOpen, user } = useAppStore();

    return (
        <header className="header flex bg-white border-b sticky top-0 z-10 h-24 items-center justify-between px-4 md:px-6">
            <div className="flex items-center gap-4">
                <button
                    className="lg:hidden text-slate-600 hover:text-blue-600 transition-colors"
                    onClick={() => setSidebarOpen(true)}
                >
                    <Menu size={24} />
                </button>
                <div className="hidden md:block">
                    <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent m-0">
                        Fuel Station System
                    </h1>
                </div>
            </div>

            <div className="flex items-center gap-6">
                {/* Language Toggle */}
                <div className="flex items-center gap-2 bg-slate-100 rounded-full p-1 border">
                    <button
                        onClick={() => setLanguage('en')}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${language === 'en' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        EN
                    </button>
                    <button
                        onClick={() => setLanguage('hi')}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${language === 'hi' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        HI
                    </button>
                </div>

                {/* User Profile */}
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <UserCircle size={24} className="text-slate-400" />
                    <div className="hidden sm:block">
                        <div>{user?.name || 'Guest'}</div>
                        <div className="text-xs text-slate-500 font-normal">{user?.role || ''}</div>
                    </div>
                </div>
            </div>
        </header>
    );
}
