"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppStore } from '@/store/appStore';
import { t } from '@/lib/i18n';
import { LayoutDashboard, FileText, CheckCircle, FileSpreadsheet, LogOut, X, IndianRupee, ChevronLeft, ChevronRight } from 'lucide-react';

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
            <div
                className={`fixed inset-0 bg-black/50 z-20 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}
                onClick={() => setSidebarOpen(false)}
            />
            <aside className={`sidebar ${sidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''} bg-white border-r flex flex-col`}>
                <div className={`h-24 px-4 lg:px-6 border-b flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
                    {!sidebarCollapsed && (
                        <h2 className="text-xl font-bold text-primary-color m-0 truncate">
                            FuelStation
                        </h2>
                    )}

                    <div className="flex items-center">
                        <button className="lg:hidden text-slate-500 hover:text-slate-800 transition-colors" onClick={() => setSidebarOpen(false)}>
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

                <div className="flex-1 overflow-y-auto py-4">
                    <ul className="space-y-1">
                        {navLinks.map((link) => {
                            const isActive = pathname.startsWith(link.href);
                            return (
                                <li key={link.href}>
                                    <Link
                                        href={link.href}
                                        onClick={() => setSidebarOpen(false)}
                                        title={sidebarCollapsed ? link.label : undefined}
                                        className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3 px-6'} py-3 mx-2 rounded-lg transition-colors ${isActive
                                            ? 'bg-blue-50 text-blue-600 font-medium'
                                            : 'text-slate-600 hover:bg-slate-50'
                                            }`}
                                    >
                                        <div className={sidebarCollapsed ? 'flex justify-center w-full' : ''}>
                                            {link.icon}
                                        </div>
                                        {!sidebarCollapsed && <span className="truncate">{link.label}</span>}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>

                <div className="p-4 border-t">
                    <button
                        onClick={() => setUser(null)}
                        className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3 px-4'} w-full py-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors`}
                        title={sidebarCollapsed ? t('logout', language) : undefined}
                    >
                        <LogOut size={20} />
                        {!sidebarCollapsed && <span className="truncate">{t('logout', language)}</span>}
                    </button>
                </div>
            </aside>
        </>
    );
}
