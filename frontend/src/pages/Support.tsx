import { Book, Users, Mail, Ticket, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Support() {
    const handleOpenTicket = () => {
        const subject = encodeURIComponent('Support Request - Tenant Provisioning Platform');
        const body = encodeURIComponent(`
Hello Support Team,

I need help with:

[Please describe your issue here]

---
Platform: Tenant Provisioning Platform
User: ${localStorage.getItem('user_settings') ? JSON.parse(localStorage.getItem('user_settings')!).email : 'Unknown'}
        `.trim());

        window.open(`mailto:support@saascompany.com?subject=${subject}&body=${body}`, '_blank');
        toast.success('Opening email client...');
    };

    const supportCards = [
        {
            title: 'Documentation',
            description: 'Read our comprehensive documentation to learn about features and best practices.',
            icon: Book,
            action: () => {
                window.open('https://github.com', '_blank');
                toast.success('Opening documentation...');
            },
            actionLabel: 'View Docs',
            color: 'bg-blue-500/10 text-blue-500',
        },
        {
            title: 'Community Forum',
            description: 'Join our community to discuss features, share ideas, and get help from other users.',
            icon: Users,
            action: () => {
                window.open('https://github.com/discussions', '_blank');
                toast.success('Opening community forum...');
            },
            actionLabel: 'Join Community',
            color: 'bg-purple-500/10 text-purple-500',
        },
        {
            title: 'Contact Support',
            description: 'Get in touch with our support team for urgent issues or account-related questions.',
            icon: Mail,
            action: () => {
                const subject = encodeURIComponent('Support Inquiry');
                window.open(`mailto:support@saascompany.com?subject=${subject}`, '_blank');
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
                    Get help with your account, explore documentation, or reach out to our support team.
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
                    and our team will get back to you as soon as possible.
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
                    <div className="p-4 bg-muted/30 rounded-lg">
                        <h4 className="font-medium mb-2">How do I create a new tenant?</h4>
                        <p className="text-sm text-muted-foreground">
                            Navigate to Tenant Management and click the "New Tenant" button. Fill in the required
                            information and the provisioning will start automatically.
                        </p>
                    </div>
                    <div className="p-4 bg-muted/30 rounded-lg">
                        <h4 className="font-medium mb-2">What happens when provisioning fails?</h4>
                        <p className="text-sm text-muted-foreground">
                            Failed provisioning jobs appear in the Failed Jobs section. You can view the error
                            details and retry the job from there.
                        </p>
                    </div>
                    <div className="p-4 bg-muted/30 rounded-lg">
                        <h4 className="font-medium mb-2">How can I monitor my services?</h4>
                        <p className="text-sm text-muted-foreground">
                            The Service Health page shows real-time status of all platform services. You can
                            also view event logs for detailed activity tracking.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
