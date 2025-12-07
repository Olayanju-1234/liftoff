import { useState, useEffect } from 'react';
import { getSettings, saveSettings } from '../lib/api';
import type { UserSettings } from '../lib/types';
import { User, Bell, Shield, Save, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Settings() {
    const [settings, setSettings] = useState<UserSettings>({
        firstName: '',
        lastName: '',
        email: '',
        emailNotifications: true,
        failedJobAlerts: true,
    });
    const [loading, setLoading] = useState(true);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const data = await getSettings();
                setSettings(data);
            } catch (error) {
                console.error('Failed to fetch settings', error);
                toast.error('Failed to load settings');
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleProfileSave = async () => {
        setSaving(true);
        try {
            const updatedSettings = await saveSettings({
                firstName: settings.firstName,
                lastName: settings.lastName,
                email: settings.email,
            });
            setSettings(updatedSettings);
            toast.success('Profile settings saved successfully!');
        } catch (error) {
            console.error('Failed to save settings', error);
            toast.error('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordUpdate = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            toast.error('Please fill in all password fields');
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }
        if (newPassword.length < 8) {
            toast.error('Password must be at least 8 characters');
            return;
        }

        try {
            // In a real app, this would call a password update endpoint
            await new Promise(resolve => setTimeout(resolve, 500));
            toast.success('Password updated successfully!');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error) {
            toast.error('Failed to update password');
        }
    };

    const toggleNotification = async (key: 'emailNotifications' | 'failedJobAlerts') => {
        const newValue = !settings[key];
        try {
            const updatedSettings = await saveSettings({
                [key]: newValue,
            });
            setSettings(prev => ({ ...prev, ...updatedSettings }));
            toast.success(`${key === 'emailNotifications' ? 'Email notifications' : 'Failed job alerts'} ${newValue ? 'enabled' : 'disabled'}`);
        } catch (error) {
            toast.error('Failed to update notification settings');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 size={32} className="animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-8 max-w-4xl">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
                <p className="text-muted-foreground mt-2">Manage your account settings and preferences.</p>
            </div>

            {/* Profile Section */}
            <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <User size={20} className="text-primary" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold">Profile Information</h3>
                        <p className="text-sm text-muted-foreground">Update your account profile details.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium mb-2">First Name</label>
                        <input
                            type="text"
                            value={settings.firstName}
                            onChange={(e) => setSettings({ ...settings, firstName: e.target.value })}
                            className="w-full bg-background border border-border rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Enter first name"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2">Last Name</label>
                        <input
                            type="text"
                            value={settings.lastName}
                            onChange={(e) => setSettings({ ...settings, lastName: e.target.value })}
                            className="w-full bg-background border border-border rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Enter last name"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium mb-2">Email Address</label>
                        <input
                            type="email"
                            value={settings.email}
                            onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                            className="w-full bg-background border border-border rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Enter email address"
                        />
                    </div>
                </div>

                <div className="mt-6 pt-6 border-t border-border flex justify-end">
                    <button
                        onClick={handleProfileSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            {/* Notifications Section */}
            <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Bell size={20} className="text-primary" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold">Notification Preferences</h3>
                        <p className="text-sm text-muted-foreground">Configure how you receive notifications.</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                        <div>
                            <p className="font-medium">Email Notifications</p>
                            <p className="text-sm text-muted-foreground">Receive email notifications for important events.</p>
                        </div>
                        <button
                            onClick={() => toggleNotification('emailNotifications')}
                            className={`w-12 h-6 rounded-full relative transition-colors ${settings.emailNotifications ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                        >
                            <div className={`w-5 h-5 bg-background rounded-full absolute top-0.5 transition-transform shadow-sm ${settings.emailNotifications ? 'translate-x-6' : 'translate-x-0.5'}`} />
                        </button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                        <div>
                            <p className="font-medium">Failed Job Alerts</p>
                            <p className="text-sm text-muted-foreground">Get notified immediately when a job fails.</p>
                        </div>
                        <button
                            onClick={() => toggleNotification('failedJobAlerts')}
                            className={`w-12 h-6 rounded-full relative transition-colors ${settings.failedJobAlerts ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                        >
                            <div className={`w-5 h-5 bg-background rounded-full absolute top-0.5 transition-transform shadow-sm ${settings.failedJobAlerts ? 'translate-x-6' : 'translate-x-0.5'}`} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Security Section */}
            <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Shield size={20} className="text-primary" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold">Security</h3>
                        <p className="text-sm text-muted-foreground">Update your password and security settings.</p>
                    </div>
                </div>

                <div className="space-y-4 max-w-md">
                    <div>
                        <label className="block text-sm font-medium mb-2">Current Password</label>
                        <input
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="w-full bg-background border border-border rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Enter current password"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2">New Password</label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full bg-background border border-border rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Enter new password"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2">Confirm New Password</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full bg-background border border-border rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Confirm new password"
                        />
                    </div>
                </div>

                <div className="mt-6 pt-6 border-t border-border flex justify-end">
                    <button
                        onClick={handlePasswordUpdate}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                    >
                        <Shield size={16} />
                        Update Password
                    </button>
                </div>
            </div>
        </div>
    );
}
