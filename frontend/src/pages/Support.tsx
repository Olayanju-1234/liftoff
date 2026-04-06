import { Book, Users, Mail, Ticket, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/auth';

const GITHUB_REPO = 'https://github.com/Olayanju-1234/liftoff';
const SUPPORT_EMAIL = 'josepholayanju2003@gmail.com';

export default function Support() {
    const { user } = useAuth();

    const handleOpenTicket = () => {
        const subject = encodeURIComponent('Support Request — Liftoff Provisioning Platform');
        const body = encodeURIComponent(
            `Hello,\n\nI need help with:\n\n[Describe your issue here]\n\n---\nUser: ${user?.email ?? 'Unknown'}`
        );
        window.open(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`, '_blank');
        toast.success('Opening email client...');
    };

    const supportCards = [
        {
            title: 'Documentation',
            description: 'Read the README for setup guides, architecture overview, and API reference.',
            icon: Book,
            action: () => {
                window.open(`${GITHUB_REPO}#readme`, '_blank');
                toast.success('Opening documentation...');
            },
            actionLabel: 'View Docs',
            color: 'bg-blue-500/10 text-blue-500',
        },
        {
            title: 'GitHub Issues',
            description: 'Report bugs or request features directly on the GitHub repository.',
            icon: Users,
            action: () => {
                window.open(`${GITHUB_REPO}/issues`, '_blank');
                toast.success('Opening GitHub Issues...');
            },
            actionLabel: 'Open Issue',
            color: 'bg-purple-500/10 text-purple-500',
        },
        {
            title: 'Contact',
            description: 'Reach out directly for urgent issues or account-related questions.',
            icon: Mail,
            action: () => {
                const subject = encodeURIComponent('Liftoff Support Inquiry');
                window.open(`mailto:${SUPPORT_EMAIL}?subject=${subject}`, '_blank');
                toast.success('Opening email client...');
            },
            actionLabel: 'Email Us',
            color: 'bg-green-500/10 text-green-500',
        },
    ];

    return (
        <div className="space-y-8 max-w-4xl">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Support</h2>
                <p className="text-muted-foreground mt-2">
                    Get help with your account, explore documentation, or reach out directly.
                </p>
            </div>

            {/* Support Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {supportCards.map((card) => (
                    <div key={card.title} className="bg-card border border-border rounded-xl p-6 flex flex-col">
                        <div className={`w-12 h-12 rounded-lg ${card.color} flex items-center justify-center mb-4`}>
                            <card.icon size={24} />
                        </div>
                        <h3 className="text-lg font-semibold mb-2">{card.title}</h3>
                        <p className="text-sm text-muted-foreground mb-4 flex-1">
                            {card.description}
                        </p>
                        <button
                            onClick={card.action}
                            className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                        >
                            {card.actionLabel}
                            <ExternalLink size={14} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Open Ticket Section */}
            <div className="bg-card border border-border rounded-xl p-8 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
                    <Ticket size={32} className="text-primary" />
                </div>
                <h3 className="text-xl font-bold mb-2">Need More Help?</h3>
                <p className="text-muted-foreground max-w-md mx-auto mb-6">
                    If you're experiencing issues that require immediate attention, open a support ticket
                    and we'll get back to you as soon as possible.
                </p>
                <button
                    onClick={handleOpenTicket}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
                >
                    <Ticket size={18} />
                    Open a Ticket
                </button>
            </div>

            {/* FAQ Section */}
            <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">Frequently Asked Questions</h3>
                <div className="space-y-4">
                    {[
                        {
                            q: 'How do I create a new tenant?',
                            a: 'Navigate to Tenant Management and click "New Tenant". Fill in the required details and provisioning starts automatically via the RabbitMQ pipeline.',
                        },
                        {
                            q: 'What happens when provisioning fails?',
                            a: 'Failed provisioning jobs appear in the Failed Jobs section with full error details. You can inspect the error and retry from there.',
                        },
                        {
                            q: 'How can I monitor my services?',
                            a: 'The Service Health page shows real-time status and latency for all microservices. The Events page gives a detailed activity log.',
                        },
                        {
                            q: 'Can I cancel a tenant that is still provisioning?',
                            a: 'Yes. From the Pipeline view or Tenant Management, you can cancel an in-progress provisioning job for a tenant.',
                        },
                    ].map((item) => (
                        <div key={item.q} className="p-4 bg-muted/30 rounded-lg">
                            <h4 className="font-medium mb-2">{item.q}</h4>
                            <p className="text-sm text-muted-foreground">{item.a}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
