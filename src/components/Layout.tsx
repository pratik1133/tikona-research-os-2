import { NavLink, Outlet } from 'react-router-dom';
import {
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn, getInitials } from '@/lib/utils';

export interface NavItemConfig {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
  group?: string;
}

export function Logo({ collapsed, subtitle, linkTo }: { collapsed: boolean; subtitle: string; linkTo: string }) {
  return (
    <NavLink to={linkTo} className="flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white">
        <img src="/tikona-logo.png" alt="Tikona Capital" className="h-7 w-7 object-contain" />
      </div>
      {!collapsed && (
        <div className="overflow-hidden">
          <h1 className="truncate text-sm font-semibold text-neutral-900 leading-tight">
            Tikona Capital
          </h1>
          <p className="truncate text-xs text-neutral-400 leading-tight">{subtitle}</p>
        </div>
      )}
    </NavLink>
  );
}

export function NavItem({
  item,
  collapsed,
}: {
  item: NavItemConfig;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  const link = (
    <NavLink
      to={item.path}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
          isActive
            ? 'bg-accent-50 text-accent-700 font-semibold'
            : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700',
          collapsed && 'justify-center px-2'
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return link;
}

export function UserProfile({ collapsed }: { collapsed: boolean }) {
  const { user, signOut } = useAuth();
  const email = user?.email ?? '';
  const avatarUrl = user?.user_metadata?.avatar_url;
  const displayName = user?.user_metadata?.full_name || email.split('@')[0];

  return (
    <div
      className={cn(
        'border-t border-neutral-200/60 p-3',
        collapsed && 'flex flex-col items-center'
      )}
    >
      <div
        className={cn(
          'flex items-center gap-3',
          collapsed && 'flex-col gap-2'
        )}
      >
        <Avatar className="h-7 w-7">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={email} />}
          <AvatarFallback className="bg-accent-100 text-accent-700 text-xs font-semibold">
            {getInitials(displayName || email)}
          </AvatarFallback>
        </Avatar>

        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-700">
              {displayName}
            </p>
          </div>
        )}

        {!collapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            className="h-7 w-7 shrink-0 text-neutral-400 hover:text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {collapsed && (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              className="mt-2 h-7 w-7 text-neutral-400 hover:text-red-600 hover:bg-red-50"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            Log out
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

interface SidebarLayoutProps {
  navItems: NavItemConfig[];
  logoSubtitle: string;
  logoLink: string;
}

export default function SidebarLayout({ navItems, logoSubtitle, logoLink }: SidebarLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Group nav items by their `group` property
  const groupedItems = useMemo(() => {
    const groups: { name: string; items: NavItemConfig[] }[] = [];
    let currentGroup: { name: string; items: NavItemConfig[] } | null = null;

    for (const item of navItems) {
      const groupName = item.group || '';
      if (!currentGroup || currentGroup.name !== groupName) {
        currentGroup = { name: groupName, items: [item] };
        groups.push(currentGroup);
      } else {
        currentGroup.items.push(item);
      }
    }
    return groups;
  }, [navItems]);

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-canvas">
        {/* Sidebar */}
        <aside
          className={cn(
            'flex flex-col border-r border-neutral-200/60 bg-white transition-all duration-200 ease-in-out shadow-[1px_0_3px_0_rgba(0,0,0,0.02)]',
            collapsed ? 'w-[60px]' : 'w-56'
          )}
        >
          {/* Header */}
          <div className="flex h-14 items-center justify-between px-3">
            <Logo collapsed={collapsed} subtitle={logoSubtitle} linkTo={logoLink} />
            {!collapsed && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCollapsed(!collapsed)}
                className="h-6 w-6 shrink-0 text-neutral-300 hover:text-neutral-500"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 min-h-0 overflow-y-auto px-2 pt-2 pb-2">
            {collapsed && (
              <div className="flex justify-center mb-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCollapsed(false)}
                  className="h-6 w-6 text-neutral-300 hover:text-neutral-500"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            {groupedItems.map((group, gi) => (
              <div key={gi}>
                {group.name && !collapsed && (
                  <p className="px-3 pt-5 pb-2 text-xs font-semibold uppercase tracking-widest text-neutral-400">
                    {group.name}
                  </p>
                )}
                {group.name && collapsed && gi > 0 && (
                  <div className="mx-2 my-2 h-px bg-neutral-100" />
                )}
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <NavItem key={item.path} item={item} collapsed={collapsed} />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* User Profile */}
          <UserProfile collapsed={collapsed} />
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  );
}
