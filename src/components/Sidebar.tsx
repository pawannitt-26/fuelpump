"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppStore } from '@/store/appStore';
import { t } from '@/lib/i18n';
import { LayoutDashboard, FileText, CheckCircle, FileSpreadsheet, LogOut, X, IndianRupee, ChevronLeft, ChevronRight, Users, Vault } from 'lucide-react';

export default function Sidebar() {
    const pathname = usePathname();
    const { language, sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebarCollapsed, user, setUser } = useAppStore();

    const isAdmin = user?.role === 'Admin';

    const navLinks = [
        {
            href: isAdmin ? '/dashboard/admin' : '/dashboard/manager',
            label: t('dashboard', language),
            icon: <LayoutDashboard size={20} />
        },
        ...(!isAdmin ? [{
            href: '/shift/entry',
            label: t('newShift', language),
            icon: <FileText size={20} />
        }] : []),
        ...(isAdmin || user?.role === 'Manager' ? [{
            href: '/dashboard/admin/employees',
            label: t('employees', language as keyof typeof t),
            icon: <Users size={20} />
        }, {
            href: '/dashboard/admin/locker',
            label: t('virtualLocker', language as keyof typeof t),
            icon: <Vault size={20} />
        }] : []),
        ...(isAdmin ? [{
            href: '/dashboard/admin/rates',
            label: t('updateRates', language),
            icon: <IndianRupee size={20} />
        }] : []),
        {
            href: '/dsr',
            label: t('dsrReport', language),
            icon: <FileSpreadsheet size={20} />
        }
    ];

    return (
        <>
            {/* Backdrop overlay for mobile */}
            <div
                className={`fixed inset-0 bg-black/50 z-30 lg:hidden transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={() => setSidebarOpen(false)}
            />
            <aside className={`sidebar ${sidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''} bg-white border-r flex flex-col`}>
                {/* Sidebar Header */}
                <div className={`h-14 md:h-16 lg:h-[72px] px-3 lg:px-5 border-b flex items-center shrink-0 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
                    {!sidebarCollapsed && (
                        <h2 className="text-lg lg:text-xl font-bold text-primary-color m-0 truncate">
                            FuelStation
                        </h2>
                    )}

                    <div className="flex items-center">
                        <button
                            className="lg:hidden text-slate-500 hover:text-slate-800 transition-colors p-2 rounded-lg active:bg-slate-100"
                            onClick={() => setSidebarOpen(false)}
                            aria-label="Close menu"
                        >
                            <X size={20} />
                        </button>

                        {/* Desktop Collapse Toggle */}
                        <button
                            onClick={toggleSidebarCollapsed}
                            className="hidden lg:flex p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition-colors"
                            title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                        >
                            {sidebarCollapsed ? <ChevronRight size={22} /> : <ChevronLeft size={22} />}
                        </button>
                    </div>
                </div>

                {/* Nav Links */}
                <div className="flex-1 overflow-y-auto py-3">
                    <ul className="space-y-0.5">
                        {navLinks.map((link) => {
                            const isActive = pathname.startsWith(link.href);
                            return (
                                <li key={link.href}>
                                    <Link
                                        href={link.href}
                                        onClick={() => setSidebarOpen(false)}
                                        title={sidebarCollapsed ? link.label : undefined}
                                        className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3 px-4 lg:px-6'} py-3 mx-2 rounded-xl transition-all duration-200 min-h-[44px] ${isActive
                                            ? 'bg-blue-50 text-blue-600 font-semibold shadow-sm shadow-blue-500/5'
                                            : 'text-slate-600 hover:bg-slate-50 active:bg-slate-100'
                                            }`}
                                    >
                                        <div className={sidebarCollapsed ? 'flex justify-center w-full' : ''}>
                                            {link.icon}
                                        </div>
                                        {!sidebarCollapsed && <span className="truncate text-sm">{link.label}</span>}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>

                {/* Logout */}
                <div className="p-3 border-t safe-area-bottom">
                    <button
                        onClick={() => setUser(null)}
                        className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3 px-4'} w-full py-3 text-slate-600 hover:text-red-600 hover:bg-red-50 active:bg-red-100 rounded-xl transition-colors min-h-[44px]`}
                        title={sidebarCollapsed ? t('logout', language) : undefined}
                    >
                        <LogOut size={20} />
                        {!sidebarCollapsed && <span className="truncate text-sm">{t('logout', language)}</span>}
                    </button>
                </div>
            </aside>
        </>
    );
}
