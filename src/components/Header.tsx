"use client";

import { useAppStore } from '@/store/appStore';
import { Menu, UserCircle } from 'lucide-react';
import NotificationCenter from './NotificationCenter';

export default function Header() {
    const { language, setLanguage, setSidebarOpen, user } = useAppStore();

    return (
        <header className="header flex bg-white border-b sticky top-0 z-10 items-center justify-between">
            <div className="flex items-center gap-2 md:gap-4">
                <button
                    className="lg:hidden text-slate-600 hover:text-blue-600 transition-colors p-2 -ml-2 rounded-lg active:bg-slate-100"
                    onClick={() => setSidebarOpen(true)}
                    aria-label="Open menu"
                >
                    <Menu size={22} />
                </button>
                <div className="hidden md:block">
                    <h1 className="text-lg lg:text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent m-0">
                        Fuel Station System
                    </h1>
                </div>
                {/* Compact mobile title */}
                <div className="md:hidden">
                    <h1 className="text-base font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent m-0">
                        FuelStation
                    </h1>
                </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
                {/* Language Toggle — compact on mobile */}
                <div className="flex items-center bg-slate-100 rounded-full p-0.5 border">
                    <button
                        onClick={() => setLanguage('en')}
                        className={`px-2.5 py-1 rounded-full text-xs sm:text-sm font-medium transition-all ${language === 'en' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        EN
                    </button>
                    <button
                        onClick={() => setLanguage('hi')}
                        className={`px-2.5 py-1 rounded-full text-xs sm:text-sm font-medium transition-all ${language === 'hi' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        HI
                    </button>
                </div>

                <NotificationCenter />

                {/* User Profile */}
                <div className="flex items-center gap-1.5 sm:gap-2 text-sm font-medium text-slate-700">
                    <UserCircle size={22} className="text-slate-400" />
                    <div className="hidden sm:block">
                        <div className="text-sm leading-tight">{user?.name || 'Guest'}</div>
                        <div className="text-[10px] text-slate-500 font-normal leading-tight">{user?.role || ''}</div>
                    </div>
                </div>
            </div>
        </header>
    );
}
