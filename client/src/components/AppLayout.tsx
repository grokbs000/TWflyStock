import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Bell,
  BookMarked,
  ChevronRight,
  History,
  LogIn,
  LogOut,
  Settings,
  TrendingUp,
  User,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { path: "/", label: "飆股雷達", icon: TrendingUp },
  { path: "/watchlist", label: "觀察清單", icon: BookMarked },
  { path: "/history", label: "篩選歷史", icon: History },
  { path: "/notifications", label: "通知中心", icon: Bell, showBadge: true },
  { path: "/settings", label: "篩選設定", icon: Settings },
];

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 60000,
  });

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ─── Desktop Sidebar (hidden on mobile) ─── */}
      <aside
        className={cn(
          "hidden md:flex flex-col shrink-0 border-r border-border transition-all duration-300 bg-sidebar relative",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Logo */}
        <div className={cn("flex items-center gap-3 px-4 py-5 border-b border-sidebar-border", collapsed && "justify-center px-2")}>
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4 text-primary" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="text-sm font-bold text-sidebar-foreground leading-tight">台股飆股</div>
              <div className="text-xs text-muted-foreground leading-tight">篩選器</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map(({ path, label, icon: Icon, showBadge }) => {
            const isActive = location === path;
            const badgeCount = showBadge && unreadCount && unreadCount > 0 ? unreadCount : 0;
            return (
              <Link key={path} href={path}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer group",
                    isActive
                      ? "bg-sidebar-primary/15 text-sidebar-primary"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    collapsed && "justify-center px-2"
                  )}
                >
                  <div className="relative shrink-0">
                    <Icon className={cn("w-4 h-4", isActive && "text-sidebar-primary")} />
                    {badgeCount > 0 && collapsed && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400" />
                    )}
                  </div>
                  {!collapsed && <span className="truncate flex-1">{label}</span>}
                  {!collapsed && badgeCount > 0 && (
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs px-1.5 py-0 shrink-0">
                      {badgeCount}
                    </Badge>
                  )}
                  {!collapsed && isActive && badgeCount === 0 && (
                    <ChevronRight className="w-3 h-3 ml-auto text-sidebar-primary/60" />
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="border-t border-sidebar-border p-3">
          <div
            className={cn(
              "w-full flex items-center gap-3 px-2 py-2 rounded-lg bg-sidebar-accent/50",
              collapsed && "justify-center"
            )}
          >
            <Avatar className="w-7 h-7 shrink-0">
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                G
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex-1 text-left overflow-hidden">
                <div className="text-xs font-medium text-sidebar-foreground truncate">訪客使用者</div>
                <div className="text-xs text-muted-foreground truncate">無需登入即可使用</div>
              </div>
            )}
          </div>
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute left-full top-1/2 -translate-y-1/2 w-4 h-8 bg-border hover:bg-primary/30 rounded-r flex items-center justify-center transition-colors z-10"
          style={{ marginLeft: "-1px" }}
        >
          <ChevronRight className={cn("w-3 h-3 text-muted-foreground transition-transform", collapsed ? "" : "rotate-180")} />
        </button>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="flex-1 overflow-y-auto relative pb-16 md:pb-0">
        {children}
      </main>

      {/* ─── Mobile Bottom Tab Bar ─── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar border-t border-sidebar-border">
        <div className="flex items-stretch">
          {navItems.map(({ path, label, icon: Icon, showBadge }) => {
            const isActive = location === path;
            const badgeCount = showBadge && unreadCount && unreadCount > 0 ? unreadCount : 0;
            return (
              <Link key={path} href={path} className="flex-1">
                <div
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 py-2 px-1 transition-all",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <div className="relative">
                    <Icon className={cn("w-5 h-5", isActive && "text-primary")} />
                    {badgeCount > 0 && (
                      <span className="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 rounded-full bg-amber-400 text-[9px] font-bold text-black flex items-center justify-center px-0.5">
                        {badgeCount > 9 ? "9+" : badgeCount}
                      </span>
                    )}
                  </div>
                  <span className={cn("text-[10px] font-medium leading-none", isActive ? "text-primary" : "text-muted-foreground")}>
                    {label.length > 4 ? label.slice(0, 4) : label}
                  </span>
                </div>
              </Link>
            );
          })}
          {/* User avatar in tab bar */}
          <div className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-muted-foreground">
            <Avatar className="w-5 h-5">
              <AvatarFallback className="bg-primary/20 text-primary text-[9px] font-bold">
                G
              </AvatarFallback>
            </Avatar>
            <span className="text-[10px] font-medium leading-none">訪客</span>
          </div>
        </div>
      </nav>
    </div>
  );
}
