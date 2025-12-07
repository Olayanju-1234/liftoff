import { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Activity, GitBranch, Heart, AlertTriangle, Settings, HelpCircle, LogOut, User } from 'lucide-react';
import { useAuth } from '../lib/auth';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Tenants', path: '/tenants', icon: Users },
    { name: 'Events', path: '/events', icon: Activity },
    { name: 'Pipeline', path: '/pipeline', icon: GitBranch },
    { name: 'Health', path: '/health', icon: Heart },
    { name: 'Failed Jobs', path: '/failed-jobs', icon: AlertTriangle },
];

const bottomNavItems = [
    { name: 'Settings', path: '/settings', icon: Settings },
    { name: 'Support', path: '/support', icon: HelpCircle },
];

interface LayoutProps {
    children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    const handleLogout = async () => {
        await logout();
        toast.success('Logged out successfully');
        navigate('/login');
    };

    const NavItem = ({ item }: { item: typeof navItems[0] }) => {
        const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));

        return (
            <NavLink
                to={item.path}
                className={clsx(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
            >
                <item.icon size={18} />
                {item.name}
            </NavLink>
        );
    };

    return (
        <div className="flex h-screen bg-background">
            {/* Sidebar */}
            <aside className="w-64 border-r border-border flex flex-col">
                <div className="p-6 border-b border-border">
                    <h1 className="text-xl font-bold text-foreground">
                        Tenant<span className="text-primary">Ops</span>
                    </h1>
                    <p className="text-xs text-muted-foreground mt-1">Provisioning Platform</p>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map((item) => (
                        <NavItem key={item.path} item={item} />
                    ))}
                </nav>

                <div className="p-4 border-t border-border space-y-1">
                    {bottomNavItems.map((item) => (
                        <NavItem key={item.path} item={item} />
                    ))}
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground text-left transition-colors"
                    >
                        <LogOut size={18} />
                        Logout
                    </button>
                </div>

                {/* User Info */}
                {user && (
                    <div className="p-4 border-t border-border">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                <User size={16} className="text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                    {user.name || user.email}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                    {user.role}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto">
                <div className="p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
