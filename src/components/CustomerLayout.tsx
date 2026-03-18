import {
  LayoutDashboard,
  FileText,
  PieChart,
} from 'lucide-react';
import SidebarLayout, { type NavItemConfig } from '@/components/Layout';

const customerNavItems: NavItemConfig[] = [
  { label: 'Dashboard',  path: '/',          icon: LayoutDashboard, end: true },
  { label: 'Reports',    path: '/reports',   icon: FileText },
  { label: 'Portfolio',  path: '/portfolio', icon: PieChart },
];

export default function CustomerLayout() {
  return (
    <SidebarLayout
      navItems={customerNavItems}
      logoSubtitle="Investor Portal"
      logoLink="/"
    />
  );
}
