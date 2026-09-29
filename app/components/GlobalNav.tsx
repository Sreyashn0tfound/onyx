'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { User, LogOut, Target, Activity, Bell, ChevronDown } from 'lucide-react';

export default function GlobalNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown if clicked outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 🔥 HIDE ON THESE ROUTES
  const hiddenRoutes = ['/welcome', '/login', '/signup', '/'];
  if (hiddenRoutes.includes(pathname || '')) {
    return null;
  }

  // Generate a fallback avatar if no image exists
  const initials = session?.user?.name 
    ? session.user.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
    : "OX";

  return (
    <div className="fixed top-6 right-6 z-[100]" ref={menuRef}>
      <div className="relative">
        
        {/* WIDGET TRIGGER */}
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-3 bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 p-2 pr-4 rounded-full shadow-2xl hover:border-white/30 transition-all"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0a84ff] to-[#bf5af2] flex items-center justify-center text-xs font-bold text-white shadow-inner">
            {initials}
          </div>
          <div className="flex flex-col items-start hidden sm:flex">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white leading-none">
              {session?.user?.name || "Operative"}
            </span>
            <span className="text-[9px] font-mono text-gray-400 tracking-widest uppercase leading-none mt-1">
              Active Link
            </span>
          </div>
          <ChevronDown size={14} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* DROPDOWN MENU */}
        {isOpen && (
          <div className="absolute right-0 mt-3 w-56 bg-[#050505]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in slide-in-from-top-2">
            <div className="p-4 border-b border-white/5">
              <p className="text-xs font-mono text-gray-400 uppercase tracking-widest truncate">
                {session?.user?.email || "No Comlink Found"}
              </p>
            </div>
            
            <div className="p-2 flex flex-col gap-1">
              <button onClick={() => { setIsOpen(false); /* Add route logic later */ }} className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-left text-sm text-gray-200 font-medium">
                <Target size={16} className="text-[#0a84ff]" /> Check Progress
              </button>
              <button onClick={() => { setIsOpen(false); /* Add route logic later */ }} className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-left text-sm text-gray-200 font-medium">
                <Activity size={16} className="text-[#bf5af2]" /> My Activity
              </button>
              <button onClick={() => { setIsOpen(false); /* Add route logic later */ }} className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-left text-sm text-gray-200 font-medium justify-between">
                <div className="flex items-center gap-3">
                  <Bell size={16} className="text-yellow-500" /> Notifications
                </div>
                {/* Mock notification badge */}
                <span className="bg-yellow-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full">2</span>
              </button>
            </div>

            <div className="p-2 border-t border-white/5 bg-red-500/5">
              <button 
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-red-500/20 transition-colors text-left text-sm text-red-400 font-bold"
              >
                <LogOut size={16} /> Sever Connection
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}